import { debug } from '../preinit/debug_settings'
import { initSystemCapabilities } from '../preinit/system_capabilities'
import { hideLoadingScreen, loadImages } from './load_resources'
import { scheduleNextLiveUpdateCheck } from './live_update'
import { showGallery } from '../gallery/view'
import { initializeFlagSubscribers } from '../app/flag_utils'
import { segmentsChanged } from '../segments/view'
import { initLocale } from '../locales/locale'
import { onNewStreetLastClick } from '../streets/creation'
import {
  setLastStreet,
  setIgnoreStreetChanges
} from '../streets/data_model'
import { initStreetNameChangeListener } from '../streets/name'
import { initStreetThumbnailSubscriber } from '../streets/image'
import { initStreetDataChangedListener } from '../streets/street'
import { initEnvironsChangedListener } from '../streets/environs'
import { initDragTypeSubscriber } from '../segments/drag_and_drop'
import { getPromoteStreet, remixStreet } from '../streets/remix'
import { loadSignIn } from '../users/authentication'
import { updateSettingsFromCountryCode } from '../users/localization'
import { detectGeolocation } from '../users/geolocation'
import { initPersistedSettingsStoreObserver } from '../users/settings'
import { addEventListeners } from './event_listeners'
import { getMode, setMode, MODES, processMode } from './mode'
import { processUrl } from './page_url'
import { onResize } from './window_resize'
import { startListening } from './keypress'
import { registerKeypresses } from './keyboard_commands'
import store, { observeStore } from '../store'
import { showDialog } from '../store/actions/dialogs'
import { everythingLoaded } from '../store/actions/app'

let serverContacted

export function setServerContacted (value) {
  serverContacted = value
}

function preInit () {
  initSystemCapabilities()
  setIgnoreStreetChanges(true)

  var language = window.navigator.userLanguage || window.navigator.language
  if (language) {
    language = language.substr(0, 2).toUpperCase()
    updateSettingsFromCountryCode(language)
  }

  registerKeypresses()

  // Start listening for keypresses
  startListening()

  observeStoreToUpdateBodyClasses()
}

export async function initialize () {
  preInit()
  if (!debug.forceUnsupportedBrowser) {
    // TODO temporary ban
    if ((navigator.userAgent.indexOf('Opera') !== -1) ||
      (navigator.userAgent.indexOf('Internet Explorer') !== -1) ||
      (navigator.userAgent.indexOf('MSIE') !== -1)) {
      setMode(MODES.UNSUPPORTED_BROWSER)
      processMode()
      return
    }
  }

  window.dispatchEvent(new window.CustomEvent('stmx:init'))

  processUrl()
  processMode()
  if (store.getState().errors.abortEverything) {
    return
  }

  // Asynchronously loading…

  // Geolocation
  // …detect country from IP for units, left/right-hand driving, and
  // adding location to streets
  const geo = await detectGeolocation()

  // Parallel tasks
  await Promise.all([ loadImages(), geo, initLocale() ])

  if (geo && geo.country_code) {
    updateSettingsFromCountryCode(geo.country_code)
  }

  // Sign in
  // …sign in info from our API (if not previously cached) – and subsequent
  // street data if necessary (depending on the mode)
  await loadSignIn()

  // Note that we are waiting for sign in and image info to show the page,
  // but we give up on country info if it’s more than 1000ms.

  checkIfEverythingIsLoaded()
}

export function checkIfEverythingIsLoaded () {
  if (store.getState().errors.abortEverything) {
    return
  }

  if (serverContacted) {
    onEverythingLoaded()
  }
}

function onEverythingLoaded () {
  switch (getMode()) {
    case MODES.NEW_STREET_COPY_LAST:
      onNewStreetLastClick()
      break
  }

  onResize()
  segmentsChanged()

  setIgnoreStreetChanges(false)
  setLastStreet()
  initStreetDataChangedListener()
  initializeFlagSubscribers()
  initPersistedSettingsStoreObserver()
  initStreetThumbnailSubscriber()

  initStreetNameChangeListener()
  initEnvironsChangedListener()
  initDragTypeSubscriber()

  addEventListeners()

  store.dispatch(everythingLoaded())
  // TODO: Only the WelcomePanel needs this event; refactor it out.
  window.dispatchEvent(new window.CustomEvent('stmx:everything_loaded'))

  if (debug.forceLiveUpdate) {
    scheduleNextLiveUpdateCheck()
  }

  window.setTimeout(hideLoadingScreen, 0)

  var mode = getMode()
  if (mode === MODES.USER_GALLERY) {
    showGallery(store.getState().gallery.userId, true)
  } else if (mode === MODES.GLOBAL_GALLERY) {
    showGallery(null, true)
  }

  if (getPromoteStreet()) {
    remixStreet()
  }

  // Display "support Streetmix" dialog for returning users
  if (mode === MODES.EXISTING_STREET || mode === MODES.CONTINUE) {
    let welcomeDismissed
    let donateDismissed
    let canDisplayWhatsNew = false

    const LSKEY_WELCOME_DISMISSED = 'settings-welcome-dismissed'
    const LSKEY_DONATE_DISMISSED = 'settings-donate-dismissed'
    const LSKEY_DONATE_DELAYED_TIMESTAMP = 'settings-donate-delayed-timestamp'
    const LSKEY_WHATSNEW_LAST_TIMESTAMP = 'whatsnew-last-timestamp'

    const twoWeeksAgo = Date.now() - 12096e5
    const whatsNewTimestamp = 1537222458620 // Hard-coded value

    const state = store.getState()
    const donateFlag = state.flags.DONATE_NAG_SCREEN.value
    const whatsNewFlag = state.flags.ALWAYS_DISPLAY_WHATS_NEW.value
    const locale = state.locale.locale

    if (window.localStorage[LSKEY_WELCOME_DISMISSED]) {
      welcomeDismissed = JSON.parse(window.localStorage[LSKEY_WELCOME_DISMISSED])
    }
    if (window.localStorage[LSKEY_DONATE_DISMISSED]) {
      donateDismissed = JSON.parse(window.localStorage[LSKEY_DONATE_DISMISSED])
    }
    if (window.localStorage[LSKEY_WHATSNEW_LAST_TIMESTAMP]) {
      if (whatsNewTimestamp > window.localStorage[LSKEY_WHATSNEW_LAST_TIMESTAMP]) {
        canDisplayWhatsNew = true
      }
    } else {
      canDisplayWhatsNew = true
    }

    // if there's no delayed timestamp, immediately set one
    // This means the user should not see the donate nag until
    // they have returned after 2 weeks.
    if (!window.localStorage[LSKEY_DONATE_DELAYED_TIMESTAMP]) {
      window.localStorage[LSKEY_DONATE_DELAYED_TIMESTAMP] = Date.now().toString()
    }

    const delayedTimestamp = JSON.parse(window.localStorage[LSKEY_DONATE_DELAYED_TIMESTAMP])

    // When to display the What's new dialog?
    // - Store a hardcoded timestamp value here for the what's new dialog.
    // - When we display the what's new dialog, store that timestamp on user's localstorage.
    // On each load, check to see if that timestamp is there, and if so, compare
    // with the hardcoded value.
    // - If we are showing the welcome message, do not show What's New.
    // - If locale is not English, do not show What's New. (We haven't localized it.)
    // - If LocalStorage has no What's New timestamp, display What's New.
    // - If LocalStorage has a timestamp value older than current, display What's New.
    // If What's New is displayed, do not display the donate box.

    if ((welcomeDismissed && canDisplayWhatsNew && locale === 'en') || whatsNewFlag) {
      store.dispatch(showDialog('WHATS_NEW'))
      window.localStorage[LSKEY_WHATSNEW_LAST_TIMESTAMP] = whatsNewTimestamp
    } else if (welcomeDismissed && !donateDismissed && donateFlag &&
       (!delayedTimestamp || delayedTimestamp < twoWeeksAgo)) {
      store.dispatch(showDialog('DONATE'))
    }
  }
}

/**
 * Toggle features based on system state. (This allows toggling to debug things,
 * which will allow us to remove the debug URL parameters as a future TODO)
 */
function observeStoreToUpdateBodyClasses () {
  const select = (state) => ({ system: state.system, app: state.app })
  const onChange = (state) => {
    document.body.classList.toggle('windows', state.system.windows)
    document.body.classList.toggle('safari', state.system.safari)
    document.body.classList.toggle('touch-support', state.system.touch)
    document.body.classList.toggle('phone', state.system.phone)
    document.body.classList.toggle('no-internet', state.system.noInternet)
    document.body.classList.toggle('read-only', state.app.readOnly)

    // Disable links in no-internet mode
    if (state.system.noInternet === true) {
      document.body.addEventListener('click', blockLinksOnClick)
    } else {
      document.body.removeEventListener('click', blockLinksOnClick)
    }
  }

  return observeStore(select, onChange)
}

/**
 * Disable all external links
 * CSS takes care of altering their appearance to resemble normal text
 */
function blockLinksOnClick (event) {
  if (event.target.nodeName === 'A' && event.target.getAttribute('href').indexOf('http') === 0) {
    event.preventDefault()
  }
}
