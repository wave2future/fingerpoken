(function() {
  /* TODO(sissel): This could use some serious refactoring. */

  $(document).ready(function() {
    var status = $("#status");
    var keyboard = $('#keyboard');
    var keyboard_button = keyboard.prev('a');
    keyboard.width(keyboard_button.width());
    keyboard.height(keyboard_button.height());
    /* TODO(sissel): get the computed width (margin, padding, width) */
    keyboard.css('margin-left', '-' + keyboard_button.width() + 'px');
    keyboard.show();

    keyboard.bind("focus", function() {
      /* move the textarea away so we don't see the caret */
      keyboard.css('margin-left', '-10000px');
      state.keyboard = true;
      $(window).triggerHandler("resize");
    });
    keyboard.bind("blur", function(){
      keyboard.css('margin-left', '-' + keyboard_button.width() + 'px');
      state.keyboard = false;
      $(window).triggerHandler("resize");
    });
    keyboard.bind("keypress", function(event) {
      var e = event.originalEvent;
      var key = e.charCode;
      if (!key) {
        key = (e.keyCode ? e.keyCode : e.which);
      }
      state.websocket.send(JSON.stringify({ 
        action: "log",
        shift: e.shiftKey,
        char: e.charCode,
        ctrl: e.ctrlKey,
        meta: e.ctrlKey,
      }));
      state.websocket.send(JSON.stringify({ 
        action: "keypress",
        key: key,
        shift: e.shiftKey,
      }));

      /* Only prevent default if we're not backspace,
       * this lets 'backspace' do keyrepeat. */
      if (key != 8) { 
        event.preventDefault();
      }
    }).bind("change", function(event) {
      /* Skip empty changes */
      if (keyboard.val() == "") {
        return;
      }

      state.websocket.send(JSON.stringify({ 
        action: "type",
        string: keyboard.val(),
      }));

      /* Clear the field */
      keyboard.val("");
    });

    keyboard.bind("keyup", function(event) {
      var e = event.originalEvent;
      state.websocket.send(JSON.stringify({ 
        action: "log",
        shift: e.shiftKey,
        char: e.charCode,
        key: e.which,
        ctrl: e.ctrlKey,
        meta: e.ctrlKey,
      }));

      var key = (e.keyCode ? e.keyCode : e.which);
      if (key >= 32 && key <= 127) {
        /* skip printable keys (a-z, etc) */
        return;
      }

      state.websocket.send(JSON.stringify({ 
        action: "keypress",
        key: key,
        shift: e.shiftKey,
      }));

      event.preventDefault();
    });

    var config = function (key, value, default_value) {
      if (value) {
        status.html("config[" + key + "] = " + value);
        //alert(key + " => " + value);
        
        window.localStorage[key] = value
        return value
      } else {
        return window.localStorage[key] || default_value
      }
    };

    var state = {
      x: -1,
      y: -1,
      moving: false,
      dragging: false,
      width: window.innerWidth,
      height: window.innerHeight,
      key: undefined, /* TODO(sissel): unused? */
      keyboard: false,
      touchpad_active: false,
      mouse: { },
      scroll: {
        y: 0,
      }
    };

    state.message_callback = function(request) {
      action = request["action"];
      switch (action) {
        case "status":
          /* Use eval to do unicode escaping */
          var status = eval("\"" + request["status"] + "\"");
          var el = $("<h1 class='status'>" + status + "</h1>");
          $("#area").empty().append(el);
          el.delay(500).fadeOut(500, function() { $(this).remove() });
          break;
      }
    };

    /* Sync configuration elements */

    /* Mouse movement */
    console.log(config("fingerpoken/mouse/movement"));
    $("input[name = \"mouse-config\"]")
      .bind("change", function(event) {
        config("fingerpoken/mouse/movement", event.target.value);
      }).filter("[value = \"" + config("fingerpoken/mouse/movement") + "\"]")
      .attr("checked", "checked").click()
    
    $("input[name = \"mouse-acceleration\"]")
      .bind("change", function(event) {
        config("fingerpoken/mouse/acceleration", parseInt(event.target.value));
      }).val(config("fingerpoken/mouse/acceleration")).change();

    /* Changing orientation sometimes leaves the viewport
     * not starting at 0,0. Fix it with this hack.
     * Also, we want to make the content size full height. */
    $(window).bind("orientationchange resize pageshow", function(event) {
      scroll(0, 0);

      var header = $(".header:visible");
      var footer = $(".footer:visible");
      var content = $(".content:visible");
      var viewport_height = $(window).height();

      var content_height = viewport_height - header.outerHeight() - footer.outerHeight();

      /* Trim margin/border/padding height */
      content_height -= (content.outerHeight() - content.height());

      /* TODO(sissel): Make this special handling only for iphones.
       * http://developer.apple.com/library/safari/#documentation/appleapplications/reference/safariwebcontent/UsingtheViewport/UsingtheViewport.html
       */
      if (state.keyboard) {
        if (window.orientation == 90 || window.orientation == -90) {
          content_height -= 162; /* landscape orientation keyboard */
          content_height -= 32; /* "form assistant" aka FormFill, this height is undocumented. */
        } else {
          content_height -= 216; /* portrait orientation keyboard */
          content_height -= 44; /* "form assistant" aka FormFill */
        }
      }
      status.html("Resize / " + window.orientation + " / " + state.keyboard + " / " + content_height);
      content.height(content_height);
    });

    var connect = function(state) {
      status.html("connecting...");
      var websocket = new WebSocket("ws://" + document.location.hostname + ":5001");
      websocket.onopen = function(event) {
        status.html("websocket ready");
      }

      websocket.onclose = function(event) {
        status.html("Closed, trying to reopen.");
        setTimeout(function() {
          connect(state);
        }, 1000);
      }

      websocket.onmessage = function(event) {
        var request = JSON.parse(event.data);
        state.message_callback(request)
      }

      state.websocket = websocket;
    }

    connect(state);

    /* This will track orientation/motion changes with the accelerometer and
     * gyroscope. Not sure how useful this would be... */
    //$(window).bind("devicemotion", function(event) {
      //var e = event.originalEvent;
      //state.accel = e.accelerationIncludingGravity;

      /* Trim shakes */
      //if (Math.abs(state.accel.x) < 0.22 && Math.abs(state.accel.y) < 0.22) {
        //return;
      //}
      //status.html("Motion: \nx: " + state.accel.x + "\ny: " + state.accel.y + "\nz: " + state.accel.z);
      //state.websocket.send(JSON.stringify({
        //action: "move",
        //rel_x: Math.ceil(state.accel.x) * -1,
        //rel_y: Math.ceil(state.accel.y) * -1,
      //}));
    //});
    

    /* TODO(sissel): add mousedown/mousemove/mouseup support */
    $("#area").bind("touchstart mousedown", function(event) {
      var e = event.originalEvent;
      state.touchpad_active = true;
      /* if no 'touches', use the event itself, one finger/mouse */
      var touches = e.touches || [ e ];
      var output = "Start: " + touches[0].clientX + "," + touches[0].clientY + "\n";
      output += "Fingers: " + touches.length + "\n";
      status.html(output);

      /* number of fingers == mouse button */
      state.fingers = touches.length;
      switch (state.fingers) {
        case 1: state.button = 1; break;
        case 2: state.button = 3; break;
        case 3: state.button = 2; break;
      }

      var now = (new Date()).getTime();
      if ((now - state.last_click) < 170) {
        /* Start dragging */
        state.websocket.send(JSON.stringify({
          action: "mousedown",
          button: state.button,
        }))
        state.dragging = true;
      }
      event.preventDefault();
    }).bind("touchend mouseup", function(event) { /* $("#touchpadsurface").bind("touchend" ...  */
      var e = event.originalEvent;
      var touches = e.touches || [ e ];

      if (state.mouse.vectorTimer) {
        clearInterval(state.mouse.vectorTimer);
        state.mouse.vectorTimer = null;
      }

      if (state.dragging) {
        state.websocket.send(JSON.stringify({
          action: "mouseup",
          button: state.button,
        }));
        state.dragging = false;
      } else {
        if (state.moving && !state.scrolling) {
          var e = state.last_move;
          var r = e.rotation;
          if (r < 0) {
            r += 360;
          }

          status.html(r);
        } else if (state.scrolling) {
          /* nothing for now */
        } else {
          /* No movement, click! */
          status.html("Click!");
          console.log("click");
          state.websocket.send(JSON.stringify({ 
            action: "click",
            button: state.button,
          }));
          state.last_click = (new Date()).getTime();
        }
      }
      if (touches.length == 0 || !e.touches) {
        state.moving = false;
        state.scrolling = false;
        state.touchpad_active = false;
      }
      event.preventDefault();
    }).bind("touchmove mousemove", function(event) { /* $("#touchpadsurface").bind("touchmove" ... */
      var e = event.originalEvent;
      var touches = e.touches || [ e ];

      //if (!state.touchpad_active) {
        //event.preventDefault();
        //return;
      //}

      if (!state.moving) {
        /* Start calculating delta offsets now */
        state.moving = true;
        state.start_x = state.x = touches[0].clientX;
        state.start_y = state.y = touches[0].clientY;
        /* Skip this event */
        return;
      }

      state.last_move = e;

      var output = "";
      for (var i in touches) {
        output += i + ": " + touches[i].clientX + "," + touches[i].clientY + "\n";
      }

      var r = e.rotation;
      if (r < 0) {
        r += 360;
      }
      output += "rotation: " + r + "\n";
      output += "scale: " + e.scale + "\n";

      var x = touches[0].clientX;
      var y = touches[0].clientY;
      var delta_x = (x - state.x);
      var delta_y = (y - state.y);

      /* Apply acceleration */
      var sign_x = (delta_x < 0 ? -1 : 1);
      var sign_y = (delta_y < 0 ? -1 : 1);

      /* jQuery Mobile or HTML 'range' inputs don't support floating point.
       * Hack around it by using larger numbers and compensating. */
      var accel = config("fingerpoken/mouse/acceleration", null, 150) / 100.0;
      output += "Accel: " + accel + "\n";

      var delta_x = Math.ceil(Math.pow(Math.abs(delta_x), accel) * sign_x);
      var delta_y = Math.ceil(Math.pow(Math.abs(delta_y), accel) * sign_y);
      output += "Delta: " + delta_x + ", " + delta_y + "\n";

      state.x = x;
      state.y = y;

      /* TODO(sissel): Make this a config option */
      if (e.rotation < -10 || e.rotation > 10) {
        /* Skip rotations that are probably not mouse-cursor-wanting movements */
        return;
      }
      /* TODO(sissel): Make this a config option */
      if (e.scale < 0.9 || e.scale > 1.1) {
        /* Skip scales that are probably not mouse-cursor-wanting movements */
        return;
      }

      if (touches.length > 1 && !state.dragging) {
        /* Multifinger movement, probably should scroll? */
        if (Math.abs(delta_y) > 0) {
          /* Scroll */
          state.scroll.y += delta_y;

          /* Don't scroll every time we move, wait until we move enough
           * that it is more than 10 pixels. */
          /* TODO(sissel): Make this a config option */
          if (Math.abs(state.scroll.y) > 10) {
            state.scrolling = true;
            state.moving = false;
            state.scroll.y  = 0;
            state.websocket.send(JSON.stringify({
              action: "click",
              button: (delta_y < 0) ? 4 : 5,
            }))
          }
        } /* if (Math.abs(delta_y) > 0) */
      } else {
        /* Only 1 finger, and we aren't dragging. So let's move! */
        /* TODO(sissel): Refactor these in to fumctions */
        var movement = config("fingerpoken/mouse/movement");
        if (movement == "relative") {
          state.websocket.send(JSON.stringify({
            action: "mousemove_relative",
            rel_x: delta_x,
            rel_y: delta_y
          }));
        } else if (movement == "absolute") {
          /* Send absolute in terms of percentages. */
          var content = $(".content:visible");
          state.websocket.send(JSON.stringify({
            action: "mousemove_absolute",
            percent_x: x / content.innerWidth(),
            percent_y: y / content.innerHeight(),
          }));
        } else if (movement == "vector") {
          if (!state.mouse.vectorTimer) {
            state.mouse.vectorTimer = setInterval(function() {
              var rx = state.x - state.start_x;
              var ry = state.y - state.start_y;
              if (rx == 0 || ry == 0) {
                return;
              }

              var sign_rx = (rx < 0 ? -1 : 1);
              var sign_ry = (ry < 0 ? -1 : 1);
              var vector_accel = accel / 1.7 /* feels like the right ratio */

              output = "rx,ry = " + rx + ", " + ry + "\n";
              rx = Math.ceil(Math.pow(Math.abs(rx), vector_accel) * sign_rx);
              ry = Math.ceil(Math.pow(Math.abs(ry), vector_accel) * sign_ry);
              output += "rx2,ry2 = " + rx + ", " + ry + "\n"; 

              state.websocket.send(JSON.stringify({
                action: "mousemove_relative",
                rel_x: rx,
                rel_y: ry
              }));
            }, 15);
          } /* if (!state.mouse.vectorTimer) */
        } /* mouse vector movement */
        status.html(output)
      } /* finger movement */
    }); /*  $("#touchpadsurface").bind( ... )*/


    /* Take commands like this:
     * 
     * Key press:
     * <a class="command" data-action="keypress" data-key="key to press">
     *
     * Mouse click
     * <a class="command" data-action="click" data-button="button to click">
     */
    $("a.command").bind("touchstart", function(event) {
      state.touchelement = this;
    }).bind("mousedown", function(event) {
      state.touchelement = this;
      event.preventDefault();
    }).bind("touchmove mousemove", function(event) {
      event.preventDefault();
    }).bind("touchend mouseup", function(event) {
      if (state.touchelement == this) {
        state.websocket.send(JSON.stringify({ 
          action: $(this).attr("data-action"),
          key: $(this).attr("data-key"),
          button: parseInt($(this).attr("data-button")),
        }));
      }
    });

  }); /* $(document).ready */
})();
