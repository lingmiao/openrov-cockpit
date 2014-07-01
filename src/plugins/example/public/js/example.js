(function (window, $, undefined) {
  'use strict';
  var Example;
  Example = function Example(cockpit) {
    console.log('Loading example plugin in the browser.');
    // Instance variables
    this.cockpit = cockpit;
    // Add required UI elements
    $('#menu').prepend('<div id="example" class="hidden">[example]</div>');

    // heads up menu
    if (window.Cockpit.headsUpMenu != undefined) {
      window.Cockpit.headsUpMenu.register('Example menu', function () {
        alert('example menu item from heads up menu');
      });
      window.Cockpit.headsUpMenu.register('Example menuCCCCCCCCCCCCCCCCCCCC', function () {
        alert('example menu item from heads up menu 2');
      });
      window.Cockpit.headsUpMenu.register('Example menu AAAAA', function () {
        alert('example menu item from heads up menu 3');
      });
    }
  };
  window.Cockpit.plugins.push(Example);
}(window, jQuery));