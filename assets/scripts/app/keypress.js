/**
 * keypress
 *
 * Handles registration, removal, and processing of keyboard inputs.
 * Some inspiration:
 *    - Mousetrap.js (https://craig.is/killing/mice)
 *    - Keypress.js (http://dmauro.github.io/Keypress/)
 *    - keymaster.js (https://github.com/madrobby/keymaster)
 *
 * @module keypress
 * @requires event-tracking
 * @exports startListening
 * @exports registerKeypress
 * @exports deregisterKeypress
 */
import { trackEvent } from './event_tracking'
import { isFocusOnBody } from '../util/focus'

// TODO: Flesh out this dictionary
const KEYS = {
  'left': 37,
  'right': 39,
  'enter': 13,
  'backspace': 8,
  'delete': 46,
  'esc': 27,
  '0': 48,
  '1': 49,
  '2': 50,
  '3': 51,
  '4': 52,
  '5': 53,
  '6': 54,
  '7': 55,
  '8': 56,
  '9': 57,
  'a': 65,
  'b': 66,
  'c': 67,
  'd': 68,
  'e': 69,
  'f': 70,
  'g': 71,
  'h': 72,
  'i': 73,
  'j': 74,
  'k': 75,
  'l': 76,
  'm': 77,
  'n': 78,
  'o': 79,
  'p': 80,
  'q': 81,
  'r': 82,
  's': 83,
  't': 84,
  'u': 85,
  'v': 86,
  'w': 87,
  'x': 88,
  'y': 89,
  'z': 90,
  // '=': [187, 61],
  '+': [187, 61, 107], // = or +; 61 for Firefox; 107 for keypad
  '-': [189, 173, 109], // 109 for keypad; 173 for Firefox
  '?': 191,
  '/': 191
}

// Keep track of all registered commands here
let inputs = {}

// Utility functions
const noop = function () {}
const returnTrue = function () { return true }

/**
 * Initiates keypress manager. Sets a global event listener on the window.
 * This should only have to be called once, when the application bootstraps.
 *
 * @public
 */
export function startListening () {
  window.addEventListener('keydown', onGlobalKeyDown)
}

/**
 * Registers a key command listener with the Keypress Manager
 *
 * @public
 * @example
 *    registerKeypress('esc', hide)
 * @example
 *    registerKeypress('shift d',
 *      { trackAction: 'Shift-D is pressed' },
 *      function () { console.log('Shift-D is pressed!') })
 * @param {(string|string[])} commands
 *    Human readable key or key combination to listen for, in the form of "a"
 *    or "shift a" or "control alt a". If multiple keys should perform the
 *    same action, pass in an array of strings, e.g. `['a', 'b', 'meta d']`
 * @param {object} [options]
 *    Options that fine tune the behavior of the keypress. If you are unhappy
 *    with a default setting, they can be overridden here. Note that it is
 *    possible for overrides to conflict with other parameters, for instance,
 *    if you set `commands` to "shift p" but `options.shiftKey` to `false`.
 *    Don't do this. This is confusing and I won't guarantee preserving how
 *    this conflict is addressed.
 * @param {(boolean|string)} [options.shiftKey=false]
 *    If `true`, the `Shift` key should be pressed in a key combination. This
 *    is automatically set to `true` if `shift` is specified in the `commands`
 *    parameter. The boolean test is strict. The string 'optional' can be
 *    passed so that the key will fire regardless of whether `Shift` is
 *    pressed.
 * @param {(boolean|string)} [options.metaKey=false]
 *    If `true`, the "meta" key (`Command` or `Control`, depending on the OS)
 *    should be pressed in a key combination. This is automatically set to
 *    `true` if `meta`, `control`, or `command` is specified in the `commands`
 *    parameter. The boolean test is strict. The string 'optional' can be
 *    passed so that the key will fire regardless of whether `Command` or
 *    `Control` is pressed.
 * @param {(boolean|string)} [options.altKey=false]
 *    If `true`, the `Alt` key should be pressed in a key combination. This
 *    is automatically set to `true` if `alt` is specified in the `commands`
 *    parameter. The boolean test is strict. The string 'optional' can be
 *    passed so that the key will fire regardless of whether `Alt` is pressed.
 * @param {(boolean)} [options.preventDefault=true]
 *    If `true`, `event.preventDefault()` should be called to prevent the
 *    key's default behavior.
 * @param {(boolean)} [options.stopPropagation=false]
 *    If `true`, `event.stopPropagation()` should be called to prevent other
 *    key handlers from triggering. Defaults to `false`, but as a special
 *    case, this is automatically set to `true` if the command is `esc`.
 * @param {(boolean)} [options.requireFocusOnBody=true]
 *    If `true`, the key handler is not triggered if the browser has focused
 *    on a specific element, like an input field.  Defaults to `true`, but as
 *    a special case, this is automatically set to `false` if the command is
 *    `esc`.
 * @param {(string)} [options.trackAction=null]
 *    If a string is provided, the action is logged in event tracking when
 *    triggered.
 * @param {(number)} [options.trackValue=null]
 *    If set, and an event is logged, this fills in the `value` property of a
 *    tracked event in Google Analytics.
 * @param {(boolean)} [options.trackOnce=true]
 *    If `true`, and an event is logged, further identical actions will not
 *    be logged.
 * @param {(function)} [options.onKeyPress]
 *    It is possible to set the callback function to execute on key press on
 *    the `options` object instead of in the `callback` parameter.
 * @param {(function)} [options.condition]
 *    If additional conditions are required before executing a callback
 *    function after a key is pressed, this function is evaluated. It must
 *    return a `true` or truthy value for the callback to execute.
 * @param {boolean} [options.fireOnce]
 *    If `true`, the keypress is only activated one time and is immediately
 *    deregistered when the callback is executed.
 * @param {function} [callback]
 *    Function to execute when key is pressed. Technically, this is optional
 *    (and you might prefer to set it on `options` instead). If there is no
 *    callback function the keypress simply does nothing.
 */
export function registerKeypress (commands, options, callback) {
  // Defaults
  // For shiftKey, metaKey, and altKey, specifies what it should
  // match on the event object reported by the browser. For instance,
  // if event.metaKey is false, it means the command must be executed
  // only if the meta key (ctrl or command depending on the OS) is not
  // pressed. (Note that ctrlKey will be internally mapped to behave
  // the same as metaKey here.) The distinction is strict, pass the
  // value 'optional' to make the system ignore whether a key is pressed.
  const defaults = {
    shiftKey: false,
    metaKey: false,
    altKey: false,
    onKeypress: noop,
    condition: returnTrue,
    preventDefault: true,
    stopPropagation: false,
    requireFocusOnBody: true,
    fireOnce: false,
    trackAction: null,
    trackValue: null,
    trackOnce: true
  }

  // Check if the second argument is the options object or the callback function
  if (typeof arguments[1] === 'object') {
    options = arguments[1]
  } else if (typeof arguments[1] === 'function') {
    // The second argument is the callback function
    // You cannot pass two callback functions
    options = {}
    callback = arguments[1]
  }

  const originalCommands = commands
  const commandObj = processCommands(commands)

  // Process each command input
  for (let keyCode in commandObj) {
    let commands = commandObj[keyCode]

    for (let command of commands) {
      // Get default settings
      for (let key in defaults) {
        if (typeof command[key] === 'undefined') {
          command[key] = defaults[key]
        }
      }

      // Store the original commands entry
      // This helps with deregistering later
      command.originalCommands = originalCommands

      // Special case for 'ESC' key; it defaults to global (window) focus
      if (parseInt(keyCode, 10) === KEYS['esc']) {
        command.requireFocusOnBody = false
        command.stopPropagation = true
      }

      // Attach callback function to execute
      if (typeof callback === 'function') {
        command.onKeypress = callback
      }

      // If options are specified, replace defaults
      // This basically allows other code to override settings via the
      // options object - it's dumb, but there's no protection against it,
      // and who knows, could be useful in edge cases
      for (let k in options) {
        command[k] = options[k]
      }

      // Add processed commands to module's inputs holder
      if (typeof inputs[keyCode] === 'undefined') {
        inputs[keyCode] = []
      }
      inputs[keyCode].push(command)
    }
  }
}

/**
 * Deregisters a key command listener, given matching `commands` and
 * `callback` parameters.
 *
 * @public
 * @example Deregisters all triggers for `shift d`
 *    deregisterKeypress('shift d')
 * @example Deregisters triggers matching callback function `hide` and key `esc`
 *    deregisterKeypress('esc', hide)
 * @param {(string|string[])} commands
 *    Human readable key or key combination to listen for, in the form of "a"
 *    or "shift a" or "control alt a". If multiple keys should perform the
 *    same action, pass in an array of strings, e.g. `['a', 'b', 'meta d']`
 * @param {function} [callback]
 *    Callback function to execute when key is pressed. This is if you want
 *    to only remove key handlers that match the same callback. If you do not
 *    provide a callback, all handlers that match `commands` are removed.
 * @todo Because of how function equality works, not all functions passed
 *    in this way result in a true test of equality.
 */
export function deregisterKeypress (commands, callback) {
  const commandObj = processCommands(commands)

  // Process each command input
  for (let keyCode in commandObj) {
    const commands = commandObj[keyCode]

    for (let command of commands) {
      let items = inputs[keyCode]
      let x = items.length

      // A reverse while loop quickly removes all duplicates that matches
      while (x--) {
        let item = items[x]
        if (item.onKeypress === callback || typeof callback === 'undefined') {
          // Check for equality for command + function
          if ((item.shiftKey === command.shiftKey || item.shiftKey === 'optional') &&
              (item.altKey === command.altKey || item.altKey === 'optional') &&
              (item.metaKey === command.metaKey || item.metaKey === 'optional')) {
            // If matches, remove it from the command list.
            inputs[keyCode].splice(x, 1)
          }
        }
      }
    }
  }
}

/**
 * Processes commands
 *
 * @private
 * @param {(string|string[])} commands
 *    Human readable key or key combination to listen for, in the form of "a"
 *    or "shift a" or "control alt a". If multiple keys should perform the
 *    same action, pass in an array of strings, e.g. `['a', 'b', 'meta d']`
 * @returns object
 */
function processCommands (commands) {
  // If a string, force to one-element array, otherwise expect an array of strings
  if (typeof commands === 'string') {
    commands = new Array(commands)
  }

  let commandsObj = {}

  // Process each command input
  for (let command of commands) {
    // Normalize command
    //  - adjust to lower case
    //  - replace command/cmd/control/ctrl to meta (this does not remove dupes)
    command = command.toLowerCase()
      .replace(/(command|cmd|control|ctrl)/g, 'meta')
      .split(' ')

    let settings = {
      shiftKey: false,
      altKey: false,
      metaKey: false
    }

    // Check for existence of modifier keys
    // Modifier keys are removed from input array
    let isShift = command.indexOf('shift')
    if (isShift > -1) {
      settings.shiftKey = true
      command.splice(isShift, 1)
    }

    let isAlt = command.indexOf('alt')
    if (isAlt > -1) {
      settings.altKey = true
      command.splice(isAlt, 1)
    }

    let isMeta = command.indexOf('meta')
    if (isMeta > -1) {
      settings.metaKey = true
      command.splice(isMeta, 1)
    }

    // First remaining item in the input array is the key code to test for.
    // Does not support multi-keys, so rest of input (if provided) is ignored.
    let keyCode = KEYS[command[0]]

    // Keycodes might be a single number or an array
    if (keyCode) {
      let keys = []
      // If keyCode is a number, convert to single-element array
      // Can't do a shortcut version of these with numbers :-/
      if (typeof keyCode === 'number') {
        keys.push(keyCode)
      } else if (Array.isArray(keyCode)) {
        keys = keyCode
      }

      for (let key of keys) {
        settings.keyCode = key
        if (typeof commandsObj[key] === 'undefined') {
          commandsObj[key] = []
        }

        commandsObj[key].push(settings)
      }
    }
  }

  return commandsObj
}

function onGlobalKeyDown (event) {
  let toExecute = []

  // Find the right command object
  const commandsForKeyCode = inputs[event.keyCode]
  if (!commandsForKeyCode || commandsForKeyCode.length === 0) return

  // Check if the right meta keys are down
  for (let item of commandsForKeyCode) {
    if ((item.shiftKey === event.shiftKey || item.shiftKey === 'optional') &&
        (item.altKey === event.altKey || item.altKey === 'optional') &&
        (item.metaKey === event.metaKey || item.metaKey === event.ctrlKey || item.metaKey === 'optional')) {
      toExecute.push(item)
    }
  }

  // Execute input's callbacks, if found
  for (let input of toExecute) {
    execute(input, event)
  }
}

/**
 * Executes an input's callback function
 *
 * @private
 * @param {object} input - The input object to execute
 * @param {Event} [event] - The browser's `Event` object created when `keydown` is fired
 */
function execute (input, event) {
  // Check if condition is satisfied
  if (!input.condition()) return

  // Check if focus is on the correct place
  if (input.requireFocusOnBody === true && isFocusOnBody() === false) return

  if (event && input.preventDefault) {
    event.preventDefault()
  }
  if (event && input.stopPropagation) {
    event.stopPropagation()
  }
  if (input.trackAction) {
    trackEvent('INTERACTION', input.trackAction, 'KEYBOARD', input.trackValue, input.trackOnce)
  }

  // Execute callback
  // Pass event through to callback function
  input.onKeypress(event)

  // Deregisters the input immediately if it is only supposed to be executed once
  if (input.fireOnce === true) {
    deregisterKeypress(input.originalCommands, input.onKeypress)
  }
}
