import debounce from './debounce';

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export default {
  active: undefined,
  toolsSelector: '.viewer-tools',
  $cornerstoneViewport: $('#cornerstoneViewport'),
  deactivateActiveTool() {
    if (this.active) {
      this.deactivate(this.active);
      this.active = undefined;
    }
  },

  toggleTool(toolToActivate) {
    if (!toolToActivate) {
      return;
    }

    if (isMobile) {
      if (toolToActivate === 'length') {
        toolToActivate = `${toolToActivate}Touch`;
      } else {
        toolToActivate = `${toolToActivate}TouchDrag`;
      }
    }

    if (this.active) {
      this.deactivate(this.active);
    }

    cornerstoneTools[toolToActivate].activate(this.element, 1);

    this.active = toolToActivate;
  },

  deactivate(tool) {
    cornerstoneTools[tool].deactivate(this.element, 1);
  },

  selectImage(event) {
    // Get the range input value
    const newImageIdIndex = parseInt(event.currentTarget.value, 10);
    const stackToolDataSource = cornerstoneTools.getToolState(this.$cornerstoneViewport[0], 'stack');

    if (stackToolDataSource === undefined) {
      return;
    }

    const stackData = stackToolDataSource.data[0];

    // Switch images, if necessary
    if(newImageIdIndex !== stackData.currentImageIdIndex && stackData.imageIds[newImageIdIndex] !== undefined) {
      cornerstone.loadAndCacheImage(stackData.imageIds[newImageIdIndex]).then((image) => {
        const viewport = cornerstone.getViewport(this.$cornerstoneViewport[0]);

        stackData.currentImageIdIndex = newImageIdIndex;
        cornerstone.displayImage(this.$cornerstoneViewport[0], image, viewport);
      });
    }
  },

  initStackTool(imageIds) {
    const slider = $('.imageSlider')[0];
    const stack = {
      currentImageIdIndex: 0,
      imageIds: imageIds
    };

    // Init slider configurations
    slider.min = 0;
    slider.max = stack.imageIds.length;
    slider.step = 1;
    slider.value = stack.currentImageIdIndex;

    // Clear any previous tool state
    cornerstoneTools.clearToolState(this.element, 'stack');

    // Disable stack prefetch in case there are still queued requests
    cornerstoneTools.stackPrefetch.disable(this.element);

    cornerstoneTools.addStackStateManager(this.element, ['stack']);
    cornerstoneTools.addToolState(this.element, 'stack', stack);
    cornerstoneTools.stackPrefetch.enable(this.element);

    // Adding input listener
    $(slider).on('input', this.selectImage.bind(this));
    // Setting the slider size
    $(slider).css('width', `${this.$cornerstoneViewport.height()}px`)
    $(window).on('resize', debounce(() => $(slider).css('width', `${this.$cornerstoneViewport.height()}px`), 150));

    // Listening to viewport stack image change, so the slider is synced
    this.$cornerstoneViewport[0].addEventListener('cornerstonenewimage', function (event) {
      const eventData = event.detail;
      const newImageIdIndex = stack.currentImageIdIndex;

      // Update the slider value
      slider.value = newImageIdIndex;
    });
  },

  initInteractionTools() {
    /*
    For touch devices, by default we activate:
    - Pinch to zoom
    - Two-finger Pan
    - Three (or more) finger Stack Scroll

    We also enable the Length tool so it is always visible
     */
    cornerstoneTools.zoomTouchPinch.activate(this.element);
    cornerstoneTools.panMultiTouch.activate(this.element);
    cornerstoneTools.stackScrollMultiTouch.activate(this.element);
    cornerstoneTools.length.enable(this.element);

    /* For mouse devices, by default we turn on:
    - Stack scrolling by mouse wheel
    - Stack scrolling by keyboard up / down arrow keys
    - Pan with middle click
    - Zoom with right click
     */
    cornerstoneTools.stackScrollWheel.activate(this.element);
    cornerstoneTools.stackScrollKeyboard.activate(this.element);
    cornerstoneTools.pan.activate(this.element, 2);
    cornerstoneTools.zoom.activate(this.element, 4);


    /*
    Set the tool color
     */
    cornerstoneTools.toolColors.setActiveColor('greenyellow');
    cornerstoneTools.toolColors.setToolColor('white');

    // Stop users from zooming in or out too far
    cornerstoneTools.zoom.setConfiguration({
        minScale: 0.3,
        maxScale: 10
    });
  },

  attachEvents() {
    // Extract which tool we are using and activating it
    $(this.toolsSelector).on('click', 'div[data-tool]', event => {
      const $element = $(event.currentTarget);

      const tool = $element.attr('data-tool');

      $('.active').removeClass('active');

      this.toggleTool(tool);

      $element.addClass('active');
    });

    // Limiting measurements to 1
    function handleMeasurementAdded (event) {
      // Only handle Length measurements
      const toolType = 'length';
      if (event.detail.toolType !== toolType) {
        return;
      }

      // Retrieve the current image
      const element = event.detail.element;
      const image = cornerstone.getImage(element);
      const currentImageId = image.imageId;

      // When a new measurement is added, retrieve the current tool state
      const toolStateManager = cornerstoneTools.globalImageIdSpecificToolStateManager;
      const toolState = toolStateManager.saveToolState();

      // Loop through all of the images (toolState is keyed by imageId)
      let allLengths = [];
      Object.keys(toolState).forEach(imageId => {
        // Delete all length measurements on images that are not the
        // current image
        if (imageId !== currentImageId) {
          delete toolState[imageId][toolType];
        }
      });

      // Retrieve all of the length measurements on the current image
      const lengthMeasurements = toolState[currentImageId][toolType].data;

      // If there is more than length measurement, remove the oldest one
      if (lengthMeasurements.length > 1) {
        lengthMeasurements.shift();

        // Re-save this data into the toolState object
        toolState[currentImageId][toolType].data = lengthMeasurements;
      }

      // Restore toolState into the toolStateManager
      toolStateManager.restoreToolState(toolState);

      // Update the image
      cornerstone.updateImage(element);
    };

    this.element.removeEventListener('cornerstonetoolsmeasurementadded', handleMeasurementAdded);
    this.element.addEventListener('cornerstonetoolsmeasurementadded', handleMeasurementAdded);
  },

  initTools(imageIds) {
    // Clear all old tool data
    cornerstoneTools.globalImageIdSpecificToolStateManager.restoreToolState({});

    cornerstoneTools.mouseInput.enable(this.element);
    cornerstoneTools.touchInput.enable(this.element);
    cornerstoneTools.mouseWheelInput.enable(this.element);
    cornerstoneTools.keyboardInput.enable(this.element);

    this.initStackTool(imageIds);

    // Set the element to focused, so we can properly handle keyboard events
    $(this.element).attr('tabindex', 0).focus();

    this.initInteractionTools();

    // If a previously active tool exists, re-enable it.
    // If not, use wwwc
    const toolToActivate = this.active || 'wwwc'
    this.toggleTool(toolToActivate);

    // Remove the 'active' highlight from the other tools
    $(`${this.toolsSelector} .active`).removeClass('.active');

    // Add it to our desired tool
    $(`${this.toolsSelector} div[data-tool=${toolToActivate}]`).addClass('active');

    // removing default context menu
    this.element.oncontextmenu = function (event) {
      event.preventDefault();

      return false;
    };

    this.attachEvents();
  }
};
