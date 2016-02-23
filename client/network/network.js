Template.network.created = function() {
  // console.log("init network");

  // get reactive graphState
  this.graphState = this.view.parentView.parentView._templateInstance.graphState.get()

  // constants
  this.colors = d3.scale.category20b();
  this.editMode = this.data.editMode;

  // init node/edge selector
  $('#infoBox').hide(); // hide infobox by default
  Session.set( 'currentId', null );
  Session.set( 'currentType', null );
  Session.set('pathTargetNodeId', null);

  // node merger
  Session.set("mergeSource", null)
  Session.set("mergeTargets", null)

};

Template.network.rendered = function() {
    var self = this;

    // fetch and parse data
    var edges = Edges.find().fetch().map(function(i){ i.data._id = i._id; return i }), // make _id accessible in the node.data()
        nodes = Nodes.find().fetch().map(function(i){ i.data._id = i._id; return i });
    console.log("nodes", nodes.length)
    console.log("edges", edges.length)

    // init graph
    this.graph = cytoscape({
        container: document.getElementById("network"),
        hideLabelsOnViewport: true,
        ready: function() {
          // console.log('topogram ready');
        },
        // load existing positions
        layout: {
            name: 'preset'
        },
        // style
        style: cytoscape.stylesheet()
            .selector('node')
              .style({
                'font-size': 6,//this.graphState.fontSize,
                'text-valign': 'center',
                'text-halign': 'right',
                'color': 'black',
                'text-max-width': 60,
                'text-wrap': 'wrap',
                'min-zoomed-font-size': 0.4,
                'background-color' : function(e) {
                  var color = "#CCC"; // default
                  if (e.data("group")) color = self.colors(e.data("group"));
                  else if (e.data("color")) color = color;
                  return e.data('starred') ? 'yellow' : color;
                },
                // 'text-opacity' : 0, // hide label by default
                'label': function(e) {
                  return e.data("name") ? e.data("name").trunc(20) : "";
                }
              })
            // node with degree zero
            .selector('node[[degree = 0]]')
              .style({
                  'background-color': '#555'
              })
            .selector('edge')
              .style({
                'background-color' : "#000",
                'target-arrow-shape': 'none', // default is undirected graph
                'width': function(e) {
                  return e.data("weight") ? e.data("weight") : 1;
                },
                'text-opacity' : 0, // hide label by default
                'label': function(e) {
                  return e.data("name") ? e.data("name") : "";
                }
              })
            .selector('.edgehandles-hover')
              .style({
                  'background-color': 'red'
              })
            .selector('.edgehandles-source')
            .selector('.edgehandles-target')
            .selector('.edgehandles-preview, .edgehandles-ghost-edge')
              .style({
                  'line-color': 'red',
                  'target-arrow-color': 'red',
                  'source-arrow-color': 'red'
              })
      });



    // init data
    this.graph.elements().remove(); // make sure evything is clean
    this.graph.add(nodes); // prevent edges to be added before nodes
    this.graph.add(edges);

    // apply size
    var degreeDomain = d3.scale.linear().domain([this.graph.nodes().minDegree(),this.graph.nodes().maxDegree()]).range([6,40]);
    this.graph.style()
      .selector('node')
      .style({
        'width': function(e) {
          return degreeDomain(e.degree());
        },
        'height': function(e) {
          return degreeDomain(e.degree());
        }
      }).update()

    this.graph.reset(); // render layout

    // mouse select actions
    this.graph.on('select', 'node', /*_.debounce(*/ function(e) {
        var node = e.cyTarget;
        self.graph.selectElement(e.cyTarget, "node");
    });

    this.graph.on('select', 'edge', /*_.debounce(*/ function(e) {
        var node = e.cyTarget;
        self.graph.selectElement(e.cyTarget, "edge");
    });

    this.graph.selectElement = function(el, type){
      Session.set('currentType', type);
      Session.set('currentId', el.id());

      self.graph.focusOnNodes(el)
      $('#infoBox').show();

      var url = self.graph.getElementUrl(el, type);
      Router.go(url);
    }

    this.graph.deselectAll = function(){
      Session.set('currentType', null);
      Session.set('currentId', null);
      Session.set('pathTargetNodeId', null);

      self.graph.unFocus();
      $('#infoBox').hide();
      $('#commentBox').hide();
      Router.go(window.location.pathname);
    }

    this.graph.getElementUrl = function(el, type) {
      // get node/edge _id
      var element;
      if(type =="node") {
        element = Nodes.findOne({"data.id" : el.id()})
      } else if (type == "edge") {
        element = Edges.findOne({"data.id" : el.id()})
      }
      return window.location.pathname + "#"+type+"-"+element._id;
    }

    this.graph.getElementById = function(id, type){
      if(type == "node") {
        return self.graph.nodes().filter("[id='"+id+"']");
      } else if (type == "edge") {
        return self.graph.edges().filter("[id='"+id+"']");
      }
    }

    // mouse over
    this.graph.on('mouseover', 'node', /*_.debounce(*/ function(e) {
        e.cyTarget.style({
          'border-width': 2,
          'border-color': '#D84315',
          'font-size' : 8,
          'label': function(d) {
            return d.data("name") ? d.data("name") : "";
          }
        })
    });
    this.graph.on('mouseout', 'node', /*_.debounce(*/ function(e) {
        e.cyTarget.style({
          'border-width': 0,
          'font-size' : 6,
          'label': function(d) {
            return d.data("name") ? d.data("name").trunc(20) : "";
          }
        })
    });

    this.graph.drawPath = function( sourceNode, targetNode ) {
      console.log(self.graph, sourceNode, targetNode);
      self.graph.unFocus();
      var path = self.graph.elements().dijkstra(sourceNode).pathTo(targetNode);

      // self.graph.focusOnNodes(path);
      self.graph.nodes().style({ 'opacity': '.1' });
      self.graph.edges().style({ 'opacity': '.1' });
      path.style({ 'opacity': '1' });

      // make only the focus selectable
      self.graph.nodes().unselectify();
      self.graph.edges().unselectify(false);
      path.selectify();
    }

    // select / unsleselct nodes
    this.graph.focusOnNodes = function(selectedNodes){
      self.graph.nodes().style({
          'opacity': '.1'
      });
      self.graph.edges().style({
          'opacity': '.1'
      });

      // select
      var subGraph = selectedNodes.closedNeighborhood();
      selectedNodes.style({
          'opacity': '1'
      });
      subGraph.style({
          'opacity': '1'
      });


      // make only the focus selectable
      self.graph.nodes().unselectify();
      self.graph.edges().unselectify(false);
      subGraph.selectify();

      // store actual position
      subGraph.nodes().forEach(function(d){
        var prevPos = Object({"x":d.position().x, "y":d.position().y})
        d.data("prevPos", prevPos);
      })

      // apply focus layout
      subGraph.layout({"name":"concentric"})
    }

    this.graph.unFocus = function(){
      self.graph.nodes().style( {
          "opacity": '1'
      } );
      self.graph.edges().style( {
          "opacity": '1'
      } );
      self.graph.nodes().selectify();
      self.graph.edges().selectify();

      // remove layout focus and re-apply previous positions
      self.graph.nodes().forEach(function(d){
        if( d.data("prevPos") ) {
          d.position(d.data("prevPos"))
          delete d.removeData("prevPos")
        }
      })
      self.graph.layout({"name":"preset"})
    }

    // load node if hash
    if(window.location.hash) {
      var type = window.location.hash.split("-")[0].replace("#","");
      var elementId = window.location.hash.split("-")[1];
      var element;
      console.log(type, elementId);
      if(type =="node") {
        element = Nodes.findOne({"_id" : elementId})
      } else if (type == "edge") {
        element = Edges.findOne({"_id" : elementId})
      }
      console.log(element);
      var el = self.graph.getElementById(element.data.id, type);
      console.log(el);
      if(el) self.graph.selectElement(el, type)
    }

    // drag node
    this.graph.on('free', 'node', /*_.debounce(*/ function(e) {
        var node = e.cyTarget;

        // update position
        Meteor.call('updateNodePosition', node.id(), node.position());
        console.log(this);
        console.log(self);
        // Node Merger
        if(self.editMode) {
            // check for node merger
            console.log("check for node merger")

            // hit test
            var bb = node.boundingbox();
            var targets = self.graph.nodes().filterFn(function(d){
                var isPos =
                  d.position().x > bb.x1
                  &&
                  d.position().x < bb.x2
                  &&
                  d.position().y > bb.y1
                  &&
                  d.position().y < bb.y2;
                var isSame = (d.id() == node.id());
                return isPos && !isSame;
            })

            // console.log(node, targets);
            if (targets.length) {
                Session.set("mergeSource", node.id())
                Session.set("mergeTargets", targets.map(function(d){return d.id()}))
                $('#modal-merge').openModal();
            }
        };
    });

    // interactive edge creation
    this.graph.edgehandles({
        complete: function(source, target, addedEntities) {
            Meteor.call('addEdgeFromIds', self.topogramId, source.data('id'), target.data('id'));
        }
    });
    this.graph.edgehandles("disable"); // disbaled by default

    if(!this.editMode) {
      self.graph.autolock(true); // prevent drag
      self.graph.edgehandles("disable");
    }

    // context menu (right click)
    if(this.editMode)
      this.graph.cxtmenu({
        selector: 'node',
        commands: [{
            content: '<span><i class="small material-icons">delete</i></span>',
            select: function() {

                // remove the node plus all connected edges
                Meteor.call('deleteNodeAndConnectedEdges', this.id(), this.neighborhood('edge').map(function(d) {
                    return d.id()
                }));

                // remove from graph
                self.graph.remove(this.neighborhood('edge'));
                self.graph.remove(this);
            }
        }, {
            content: '<span><i class="small material-icons">star_rate</i></span>',
            select: function() {
              Meteor.call('starNode', this.id());
              var starred = (this.data("starred")) ? false : true;
              this.data("starred", starred)
            }
        // }, {
        //     content: '<span><i class="small material-icons">lock</i></span>',
        //     select: function() {
        //         // console.log( this.position() );
        //         Meteor.call('lockNode', this.id(), this.position());
        //     },
        },{
            content: '<span><i class="small material-icons">comment</i></span>',
            select: function() {
                self.graph.selectElement(this, "node")
                $("#commentBox").show()
            },

        },{
            content: '<span><i class="small material-icons">library_books</i></span>',
            select: function() {
              // TODO : share to social networks
              self.graph.selectElement(this, "node")
            },

        }]
      });

    // set global var
    this.view.parentView.parentView._templateInstance.network.set(this.graph);

    // watch changes
    /*
    nodes.observeChanges( {
        added: function( id, fields ) {
            // console.log( 'node added' );
            // network.addNode
        },
        changed: function( _id, fields ) {
            // console.log( 'node changed' );
            var item = self.graph.nodes().filter( function( i, node ) {
                return node.data().data._id == _id;
            } );
            // console.log( item );
            for ( var field in fields ) {
                var f = fieldFunctionMap[ field ];
                // console.log( _, f );
                if ( _.isFunction( f ) ) {
                    // console.log( 'test' );
                    f( item, fields[ field ] );
                }
            }
        },
        removed: function() {
            // console.log( 'node removed' );
        }
    } );

    edges.observeChanges( {
        added: function( id, fields ) {
            // console.log( 'edge inserted' );
        },
        changed: function( id, fields ) {
            // console.log( 'edge updated' );
        },
        removed: function() {
            // console.log( 'edge removed' );
        }
    } );
    */
    // console.log('network : ', topogramId, nodes .length, 'nodes', edges .length, 'edges' );
};
