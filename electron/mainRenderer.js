console.time('init')

const request = require("request")
const crypto = require("crypto")
const ReconnectingWebSocket = require('./vendor/rws.js')
const fs = require('fs')
const jwt = require('jsonwebtoken')
const Timer = require('easytimer.js');

const { remote, ipcRenderer, shell } = require('electron')
const { Menu, MenuItem } = remote
let browserWindow = remote.getCurrentWindow()

window.addEventListener('beforeunload', function() {
    ws.send("die")
})

let rightClickPosition = null

const menu = new Menu()
const menuItem = new MenuItem({
  label: 'Inspect Element',
  click: () => {
    remote.getCurrentWindow().inspectElement(rightClickPosition.x, rightClickPosition.y)
  }
})
menu.append(menuItem)

const API_URL = "https://gxt.mtgatracker.com/str-85b6a06b2d213fac515a8ba7b582387a-pt/mtgatracker-prod-EhDvLyq7PNb"

var debug = remote.getGlobal('debug');
var useFrame = remote.getGlobal('useFrame');
var showIIDs = remote.getGlobal('showIIDs');
var showErrors = remote.getGlobal('showErrors');
var appVersionStr = remote.getGlobal('version');
var runFromSource = remote.getGlobal('runFromSource');
var showWinLossCounter = remote.getGlobal('showWinLossCounter');
var sortMethod = remote.getGlobal('sortMethod');
var zoom = remote.getGlobal('zoom');
var showChessTimers = remote.getGlobal('showChessTimers');
var hideDelay = remote.getGlobal('hideDelay');
var invertHideMode = remote.getGlobal('invertHideMode');
var showGameTimer = remote.getGlobal('showGameTimer');
var zoom = remote.getGlobal('zoom');
var timerRunning = false;

var lastUseTheme = remote.getGlobal('useTheme')
var lastThemeFile = remote.getGlobal('themeFile')

var token = null;

if (debug) {
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    rightClickPosition = {x: e.x, y: e.y}
    menu.popup(remote.getCurrentWindow())
  }, false)
}

var ws = new ReconnectingWebSocket("ws://127.0.0.1:5678/", null, {constructor: WebSocket})

var gameLookup = {}
var lastGameState = null;
var resizing = false;

var overallTimer = new Timer();
var heroTimer = new Timer();
var opponentTimer = new Timer();

window.overallTimer = overallTimer
window.heroTimer = heroTimer
window.opponentTimer = opponentTimer

var winLossCounterInitial = remote.getGlobal("winLossCounter")

let getMainWindowDisplay = () => {
  let {x, y} = browserWindow.getBounds()
  let display = remote.screen.getDisplayNearestPoint({x: x, y: y})
  return display;
}

let calcMainMaxHeight = () => {
  let displayBounds = getMainWindowDisplay().bounds
  let displayY= displayBounds.y
  let displayHeight = displayBounds.height
  let windowBounds = browserWindow.getBounds()
  let windowY = windowBounds.y
  let maxHeight = displayHeight - (windowY - displayY)
  return maxHeight + 10;  // add some buffer; 10px won't hide anything
}

var appData = {
    deck_name: "loading...",
    cant_connect: false,
    showErrors: showErrors,
    last_error: "",
    error_count: 0,
    debug: debug,
    show_iids: showIIDs,
    last_connect: 0,
    last_connect_as_seconds: 0,
    game_in_progress: false,
    showDraftStats: false,
    draftStats: [],
    game_complete: false,
    game_dismissed: false,
    show_available_decklists: true,
    no_decks: false,
    no_list_selected: true,
    list_selected: false,
    selected_list_size: "0",
    selected_list: [],
    selected_list_name: "",
    player_decks: [],
    total_cards_in_deck: "0",
    draw_stats: [],
    opponent_hand: [],
    messages: [],
    version: appVersionStr,
    showWinLossCounter: showWinLossCounter,
    winCounter: winLossCounterInitial.win,
    lossCounter: winLossCounterInitial.loss,
    showGameTimer: showGameTimer,
    showChessTimers: showChessTimers,
    hideDelay: hideDelay,
    invertHideMode: invertHideMode,
}

var parseVersionString = (versionStr) => {
    version = {}
    version_parts = versionStr.split("-")
    if (version_parts.length > 1)
        version.suffix = version_parts[1]
    version_bits = version_parts[0].split(".")
    version.major = version_bits[0]
    version.medium = version_bits[1]
    version.minor = version_bits[2]
    return version;
}

var dismissMessage = (element) => {
   let elementIdx = element.attributes.index.value
   let messageID = false
   if (element.attributes.messageID) {
     messageID = element.attributes.messageID.value
   }
   if (messageID) {
     ipcRenderer.send('messageAcknowledged', messageID)
   }
   appData.messages[elementIdx]["show"] = false;
}

request.get({
    url: `${API_URL}/public-api/tracker-notifications`,
    json: true,
    headers: {'User-Agent': 'MTGATracker-App'}
}, (err, res, data) => {
  if (appData.messages)
    appData.messages = appData.messages.concat(...data.notifications)
})

let cardtypeCompare = function (a, b) {
    // Creatures -> Planeswalkers -> Enchantments -> Artifacts -> Sorceries -> Instants -> Non-Basic Lands -> Basic Lands
    if (a.includes("Creature")) {
        if (!b.includes("Creature")) {
            return -1;
        }
        return 0;
    }
    if (b.includes("Creature")) {
        return 1;
    }
    if (a.includes("Planeswalker")) {
        if (!b.includes("Planeswalker")) {
            return -1;
        }
        return 0;
    }
    if (b.includes("Planeswalker")) {
        return 1;
    }
    if (a.includes("Enchantment")) {
        if (!b.includes("Enchantment")) {
            return -1;
        }
        return 0;
    }
    if (b.includes("Enchantment")) {
        return 1;
    }
    if (a.includes("Artifact")) {
        if (!b.includes("Artifact")) {
            return -1;
        }
        return 0;
    }
    if (b.includes("Artifact")) {
        return 1;
    }
    if (a.includes("Sorcery")) {
        if (!b.includes("Sorcery")) {
            return -1;
        }
        return 0;
    }
    if (b.includes("Sorcery")) {
        return 1;
    }
    if (a.includes("Instant")) {
        if (!b.includes("Instant")) {
            return -1;
        }
        return 0;
    }
    if (b.includes("Instant")) {
        return 1;
    }
    if (a.includes("Basic")) {
        if (!b.includes("Basic")) {
            return 1;
        }
        return 0;
    }
    if (b.includes("Basic")) {
        return -1;
    }
    return 0;
};

let manaCostCompare = function (a, b) {
    let cmcA = 0;
    let cmcB = 0;
    let cmcCompute = function (manaSymbol) {
        // Put X spells at the end
        if (manaSymbol === "X") {
            return 100;
        }
        // Generic mana amount
        let intValue = parseInt(manaSymbol);
        if (!isNaN(intValue)) {
            return intValue;
        }
        // Colored mana
        return 1;
    };
    for (let manaSymbol of a) {
        cmcA += cmcCompute(manaSymbol);
    }
    for (let manaSymbol of b) {
        cmcB += cmcCompute(manaSymbol);
    }
    if (cmcA < cmcB) {
        return -1;
    }
    if (cmcB < cmcA) {
        return 1;
    }
    return 0;
};

let nameCompare = function (a, b) {
    if (a < b) {
        return -1;
    }
    if (b < a) {
        return 1;
    }
    return 0;
};

rivets.formatters.drawStatsSort = function(decklist) {
    if (decklist.length === 0) {
        return decklist;
    }
    if (sortMethod == "draw") {
        return decklist;
    } else if (sortMethod == "emerald") {
        return decklist.sort(
                function (a, b) {
                    // Sort by cardtype first
                    return cardtypeCompare(a.card_type, b.card_type)
                        // Then sort by mana cost
                        || manaCostCompare(a.cost, b.cost)
                        // Then sort by name
                        || nameCompare(a.card, b.card);
                });
    }
};

rivets.formatters.drawStatsMergeDuplicates = function(decklist) {
    let mergedDecklist = new Map();
    decklist.forEach((card) => {
        if (mergedDecklist.get(card.card)) {
            mergedDecklist.get(card.card).count_in_deck += card.count_in_deck;
        }
        else {
            mergedDecklist.set(card.card, card);
        }
    });
    return Array.from(mergedDecklist.values());
};

rivets.formatters.decklistSort = function(decklist) {
    if (decklist.length === 0) {
        return decklist;
    }
    if (sortMethod == "draw") {
        return decklist;
    } else if (sortMethod == "emerald") {
        return decklist.sort(
            function (a, b) {
                // Sort by cardtype first
                return cardtypeCompare(a.card_type, b.card_type)
                        // Then sort by mana cost
                        || manaCostCompare(a.cost, b.cost)
                        // Then sort by name
                        || nameCompare(a.pretty_name, b.pretty_name);
        });
    }
};

rivets.formatters.decklistMergeDuplicates = function(decklist) {
    let mergedDecklist = new Map();
    decklist.forEach((card) => {
        if (mergedDecklist.get(card.pretty_name)) {
            mergedDecklist.get(card.pretty_name).count_in_deck += card.count_in_deck;
        }
        else {
            mergedDecklist.set(card.pretty_name, card);
        }
    });
    return Array.from(mergedDecklist.values());
};

rivets.bind(document.getElementById('container'), appData)

rivets.binders.showmessage = function(el, value) {
  if (value && remote.getGlobal('messagesAcknowledged').includes(value)) {
    el.style.display = "none"
  } else {
    el.style.display = "block"
  }
}

rivets.binders.mana = function(el, value) {
    mi_class = "mi-" + value.toLowerCase()
    el.classList.remove("mi-w")
    el.classList.remove("mi-b")
    el.classList.remove("mi-g")
    el.classList.remove("mi-u")
    el.classList.remove("mi-r")
    el.classList.remove("mi-1")
    el.classList.remove("mi-2")
    el.classList.remove("mi-3")
    el.classList.remove("mi-4")
    el.classList.remove("mi-5")
    el.classList.remove("mi-6")
    el.classList.remove("mi-7")
    el.classList.remove("mi-8")
    el.classList.remove("mi-9")
    el.classList.remove("mi-10")
    el.classList.remove("mi-x")
    el.classList.add(mi_class)
}

rivets.binders.card_color = function(el, value) {

  el.classList.remove("card-b")
  el.classList.remove("card-g")
  el.classList.remove("card-r")
  el.classList.remove("card-u")
  el.classList.remove("card-w")

  el.classList.remove("card-c")  // colorless
  el.classList.remove("card-m")  // multicolor, not mountain
  let atLeastOneColor = false;

  if (value.length > 1) {
    // card-m sets the fade color
    el.classList.add("card-m")
  }

  if (value.length > 2) {
    // card-m-back sets the background image to generic 3-color background
    el.classList.add("card-m-back")
  } else {

      if (value.includes("Black")) {
        el.classList.add("card-b")
        atLeastOneColor = true
      }
      if (value.includes("White")) {
        el.classList.add("card-w")
        atLeastOneColor = true
      }
      if (value.includes("Blue")) {
        el.classList.add("card-u")
        atLeastOneColor = true
      }
       if (value.includes("Green")) {
        el.classList.add("card-g")
        atLeastOneColor = true
      }
       if (value.includes("Red")) {
        el.classList.add("card-r")
        atLeastOneColor = true
      }
      if (value.includes("Colorless") || !atLeastOneColor) {
        el.classList.add("card-c")
      }
  }
}

rivets.formatters.as_seconds = function(value) {
    return value / 100;
}

let all_hidden = false;
var hideTimeoutId;

var updateOpacity = function() {
    if (all_hidden) {
        document.getElementById("container").style.opacity = "0.1";
    } else {
        document.getElementById("container").style.opacity = "1";
        if (hideTimeoutId) {
            clearTimeout(hideTimeoutId)
            hideTimeoutId = null;
        }
    }
}

var toggleOpacity = function(hide) {
    if (hide === undefined) {
      all_hidden = !all_hidden;
    } else {
      all_hidden = hide;
    }
    updateOpacity();
    if (hideTimeoutId) {
        clearTimeout(hideTimeoutId)
        hideTimeoutId = null;
    }
    if (appData.hideDelay < 100) {
      hideTimeoutId = setTimeout(function() {
          all_hidden = appData.invertHideMode;
          updateOpacity()
      }, 1000 * appData.hideDelay)
    }
}

document.getElementById("floating-eye").addEventListener("click", function() {
  toggleOpacity()
})

ws.addEventListener('open', () => {
    ws.send('hello!');
    console.log("sent hello")
});

function resizeWindow() {
    let total = 0;
    $.each($(".card"), function(i, c) {
        total += c.offsetHeight;
    })

    container = document.getElementById("container")

    let totalHeight = 10;

    $("#container").children().each(function(c, e) {
        if(e.style.display != "none")
            totalHeight += $(e).outerHeight(true);
    });
    bounds = browserWindow.getBounds()
    bounds.height = Math.min(parseInt(totalHeight), calcMainMaxHeight());
    container.style.height = "" + parseInt(totalHeight) + "px"
    if (!(debug || useFrame)) {
        browserWindow.setBounds(bounds)
    }
}

function populateDeck(elem) {
    deckID = elem.getAttribute('data-deckid')
    $.each(appData.player_decks, (i, v) => {
        if (v.deck_id == deckID) {
            appData.selected_list = v.cards;
            appData.selected_list_name = v.pool_name;
            appData.list_selected = true;
            appData.no_list_selected = false;
        }
    })
    resizeWindow()
}

function exitDraft() {
    appData.game_in_progress = false;
    appData.show_available_decklists = true;
    appData.showDraftStats = false;
    resizeWindow()
}

function unpopulateDecklist() {
    appData.list_selected = false;
    appData.no_list_selected = true;

    appData.game_in_progress = false;
    appData.show_available_decklists = true;
    appData.showDraftStats = false;

    resizeWindow()
}

function getAnonToken(attempt, errors) {
  return new Promise((resolve, reject) => {
    let tokenOK = true;
    if (token) {
      if (jwt.decode(token).exp < Date.now() / 1000) tokenOK = false
    } else {
      tokenOK = false;
    }
    if (tokenOK) {
      console.log("old token was fine")
      resolve(token)
    } else {
      console.log("sending token request...")
      request.get({
          url: `${API_URL}/public-api/anon-api-token`,
          json: true,
          headers: {'User-Agent': 'MTGATracker-App'}
      }, (err, res, data) => {
        if (err || res.statusCode != 200) {
          errors.push({on: "get_token", error: err || res})
          resolve({attempt: attempt, errors: errors})
        } else {
          console.log("got anon token")
          token = data.token;
          resolve(data.token)
        }
      })
    }
  })
}

function uploadRankChange(rankData, errors) {
  if (!errors) {
    errors = []
  }
  return new Promise((resolve, reject) => {

    setTimeout(() => {
      getAnonToken().then(token => {
        if (!remote.getGlobal("incognito")) {  // we're only allowed to use rank data if not incognito
        console.log("posting rank request... with token " + token)
          request.post({
            url: `${API_URL}/anon-api/rankChange`,
            json: true,
            body: rankData,
            headers: {'User-Agent': 'MTGATracker-App', token: token}
          }, (err, res, data) => {
            console.log("finished posting rank request...")
            console.log(res)
            console.log(err)
            if (err || res.statusCode != 200) {
              errors.push({on: "post_rankChange", error: err || res})
              reject({errors: errors})
            } else {
              console.log("rank uploaded! huzzah!")
              console.log(res)
              resolve({
                success: true
              })
            }
          })
        }
      })
    }, 3000)  // wait a second to let the game result be saved before trying to modify it's rank
  })
}

function uploadGame(attempt, gameData, errors) {
  if (!errors) {
    errors = []
  }
  if (attempt == 0) { // only set local winloss counters on first upload attempt

    if (gameData.players[0].name == gameData.winner) {
      appData.winCounter++
    } else {
      appData.lossCounter++
    }
    ipcRenderer.send('settingsChanged', {
      key: "winLossCounter",
      value: {win: appData.winCounter, loss: appData.lossCounter}
    })
  }

  return new Promise((resolve, reject) => {
    if (attempt > 5) {
      if (!remote.getGlobal("incognito")) {
        appData.messages.push({text: "WARNING! Could not upload game result to inspector! Error log generated @ uploadfailure.log ... please send this log to our discord #bug_reports channel!"})
      }
      let filePath = runFromSource ? "uploadfailure.log" : "../uploadfailure.log";
      fs.writeFile(filePath, JSON.stringify({fatal: "too_many_attempts", errors: errors}))
      reject({fatal: "too_many_attempts", errors: errors})
    } else {
      let delay = 1000 * attempt;
      setTimeout(() => {
        getAnonToken().then(token => {
          if (token.errors) {
            errors.push({on: "get_token", error: err || res})
            resolve({attempt: attempt, errors: errors})
          } else {
            gameData.client_version = appData.version
            if (remote.getGlobal("incognito")) {  // we're not allowed to use this game data :(
              gameData = {anonymousUserID: crypto.createHash('md5').update(gameData.players[0].name).digest("hex")}
            }
            console.log("posting game request...")
            request.post({
              url: `${API_URL}/anon-api/game`,
              json: true,
              body: gameData,
              headers: {'User-Agent': 'MTGATracker-App', token: token}
            }, (err, res, data) => {
              console.log("finished posting game request...")
              console.log(res)
              console.log(err)
              if (err || res.statusCode != 201) {
                errors.push({on: "post_game", error: err || res})
                resolve({attempt: attempt, errors: errors})
              } else {
                resolve({
                  success: true
                })
              }
            })
          }
        })
      }, delay)
    }
  }).then(result => {
    if (!result || !result.success) {
      return uploadGame(++attempt, gameData, result.errors)
    } else {
      return result
    }
  })
}

let gameAlreadyUploaded = (gameID) => {
  return Object.keys(gameLookup).includes(gameID)
}

let onMessage = (data) => {
    data = JSON.parse(event.data)
    if (data.data_type == "game_state") {
        if (data.match_complete) {

            timerRunning = false;
            $("#opponent-timer").removeClass("active")
            $("#hero-timer").removeClass("active")
            overallTimer.pause()
            heroTimer.pause()
            opponentTimer.pause()

            console.log("match over")
            if (data.game && gameAlreadyUploaded(data.game.gameID)) {
              console.log(`Backend sent match_complete for ${data.game.gameID}, but already know that game`)
            } else if (data.game) {
              appData.game_complete = true;
              $(".cardsleft").addClass("gamecomplete")

              gameLookup[data.game.gameID] = {count: 0, uploaded: true}
              uploadGame(0, data.game)
                .then(() => {
                  if (!remote.getGlobal("incognito") && remote.getGlobal("showInspector")) {
                    appData.messages.push({text: "Game result sent to inspector!", mayfollow: "https://inspector.mtgatracker.com"})
                  }
                })
            } else if (data.gameID) {
              console.log(`match_complete and gameID ${data.gameID} but no game data`)
              if (gameAlreadyUploaded(data.gameID)) {
                if (gameLookup[data.gameID].count++ > 5) {
                  if (!gameLookup[data.gameID].uploaded) {
                    gameLookup[data.gameID].uploaded = true
                    if (lastGameState) {
                      uploadGame(0, lastGameState)
                        .then(() => {
                          console.log("successfully uploaded game!")
                          if (!remote.getGlobal("incognito") && remote.getGlobal("showInspector")) {
                            appData.messages.push({text: "Game result sent to inspector!", mayfollow: "https://inspector.mtgatracker.com"})
                          }
                        })
                    }
                  }
                }
              } else { // gameLookup doesn't know this game yet
                console.log(`haven't seen ${data.gameID} before, adding now'`)
                gameLookup[data.gameID] = {count: 0, uploaded: false}
              }
            }
        } else {
            lastGameState = data
            if (!timerRunning) {
              timerRunning = true;
              console.log("TIMER: resetcss")
              // this is transition into a game. reset all the timers
              overallTimer.reset()
              opponentTimer.reset()
              heroTimer.reset()
              overallTimer.start()
              // pause each player's timer. we'll unpause them soon, with a decisionPlayerChange event.
              opponentTimer.pause()
              heroTimer.pause()
            }
            appData.game_in_progress = true;
            appData.show_available_decklists = false;
            appData.showDraftStats = false;

            appData.game_complete = false;
            $(".cardsleft").removeClass("gamecomplete")
            appData.draw_stats = data.draw_odds.stats;
            appData.deck_name = data.draw_odds.deck_name;
            appData.total_cards_in_deck = data.draw_odds.total_cards_in_deck;
            appData.opponent_hand = data.opponent_hand
        }

    } else if (data.data_type == "error") {
        if (data.count) {
            appData.error_count = data.count;
        }
        appData.last_error = data.msg;
    } else if (data.data_type == "message") {
        if (data.right_click) {
            toggleOpacity(!appData.invertHideMode)
        } else if (data.left_click && remote.getGlobal("leftMouseEvents")) {
            toggleOpacity(appData.invertHideMode)
        } else if (data.draft_collection_count) {
          console.log("handle draft stuff")
          console.log(data.draft_collection_count)

          appData.game_in_progress = false;
          appData.show_available_decklists = false;
          appData.showDraftStats = true;

          appData.draftStats = data.draft_collection_count
        } else if (data.rank_change) {
          console.log("handle rank stuff")
          uploadRankChange(data.rank_change).catch(e => {
            console.log("error uploading rank data: ")
            console.log(e)
          })
        } else if (data.decisionPlayerChange) {
            if (data.heroIsDeciding) {
                opponentTimer.start()
                heroTimer.pause()
                $("#opponent-timer").removeClass("active")
                $("#hero-timer").addClass("active")
            } else {
                opponentTimer.pause()
                heroTimer.start()
                $("#opponent-timer").addClass("active")
                $("#hero-timer").removeClass("active")
            }
        }
    } else if (data.data_type=="decklist_change") {
        console.log("got a dl change")
        if (data.decks.no_decks_defined) {
            appData.no_decks = true;
        } else {
            new_decks = []
            $.each(data.decks, (key, value) => {
                new_decks.push(value)
            })
            appData.player_decks = new_decks;
            appData.no_decks = false;
        }
    }
    resizeWindow()
}

document.addEventListener("DOMContentLoaded", function(event) {

    setInterval(() => {
        $('#overall-timer').html(overallTimer.getTimeValues().toString());
        $('#hero-timer').html(opponentTimer.getTimeValues().toString());
        $('#opponent-timer').html(heroTimer.getTimeValues().toString());
    }, 1000)

    if (debug || useFrame) {
        $("#container").addClass("container-framed")
        $("body").css("background-color", "green")
    } else {
        $("#container").addClass("container-normal")
    }
    $("#floating-settings").click(() => {
      ipcRenderer.send('openSettings', null)
    })
    $(".zoom-out").click(() => {
        zoom -= 0.1
        browserWindow.webContents.setZoomFactor(zoom)
        ipcRenderer.send('settingsChanged', {key: "zoom", value: zoom})
    })
    $(".zoom-in").click(() => {
        zoom += 0.1
        browserWindow.webContents.setZoomFactor(zoom)
        ipcRenderer.send('settingsChanged', {key: "zoom", value: zoom})
    })
    //open links externally by default
    $(document).on('click', 'a[href^="http"]', function(event) {
        event.preventDefault();
        shell.openExternal(this.href);
    });
    // load theme on first launch without settings change
    if (lastThemeFile && lastUseTheme) {
    let currentThemeLink = $("#theme")
    if (currentThemeLink) {
      currentThemeLink.remove()
    }
    if (lastUseTheme) {
      let head  = document.getElementsByTagName('head')[0];
      let link  = document.createElement('link');
      link.id   = 'theme';
      link.rel  = 'stylesheet';
      link.type = 'text/css';
      let themePath = runFromSource ? "themes/" : "../../../themes/";
      link.href = themePath + lastThemeFile;
      head.appendChild(link)
    }
  }
  ws.onmessage = onMessage
});

ipcRenderer.on('stdout', (event, data) => {
  console.log(data.text)
})

ipcRenderer.on('updateReadyToInstall', (messageInfo) => {
  console.log("got an update ready message")
  console.log(messageInfo)
  appData.messages.push({text: "A new tracker update will be applied on next launch!", mayfollow:"https://github.com/shawkinsl/mtga-tracker/releases/latest"})
})

ipcRenderer.on('settingsChanged', () => {
  debug = remote.getGlobal('debug');
  appData.debug = debug

  sortMethod = remote.getGlobal('sortMethod');

  useFrame = remote.getGlobal('useFrame');
  appData.useFrame = useFrame

  showIIDs = remote.getGlobal('showIIDs');
  appData.showIIDs = showIIDs

  showErrors = remote.getGlobal('showErrors');
  appData.showErrors = showErrors

  appVersionStr = remote.getGlobal('version');
  appData.appVersionStr = appVersionStr

  showWinLossCounter = remote.getGlobal('showWinLossCounter');
  appData.showWinLossCounter = showWinLossCounter

  showGameTimer = remote.getGlobal('showGameTimer');
  appData.showGameTimer = showGameTimer

  showChessTimers = remote.getGlobal('showChessTimers');
  appData.showChessTimers = showChessTimers

  hideDelay = remote.getGlobal('hideDelay');
  appData.hideDelay = hideDelay

  invertHideMode = remote.getGlobal('invertHideMode');
  appData.invertHideMode = invertHideMode

  winLossCounter = remote.getGlobal('winLossCounter');
  appData.winCounter = winLossCounter.win
  appData.lossCounter = winLossCounter.loss

  let useTheme = remote.getGlobal("useTheme")
  let themeFile = remote.getGlobal("themeFile")
  let useFlat = remote.getGlobal("useFlat")

  let currentFlatLink = $("#flat")
  if (useFlat) {
    if(!currentFlatLink.length) {
      let head  = document.getElementsByTagName('head')[0];
      let link  = document.createElement('link');
      link.id   = 'flat';
      link.rel  = 'stylesheet';
      link.type = 'text/css';
      link.href = 'flat.css';
      head.appendChild(link)
    } else {
      console.log(currentFlatLink)
    }
  } else if (currentFlatLink) {
    currentFlatLink.remove()
  }

  let useMinimal = remote.getGlobal("useMinimal")

  let currentMinimalLink = $("#minimal")
  if (useMinimal) {
    if (!currentMinimalLink.length) {
      let head  = document.getElementsByTagName('head')[0];
      let link  = document.createElement('link');
      link.id   = 'minimal';
      link.rel  = 'stylesheet';
      link.type = 'text/css';
      link.href = 'minimal.css';
      head.appendChild(link)
    }
  } else if (currentMinimalLink) {
    currentMinimalLink.remove()
  }

  if ((themeFile && (themeFile != lastThemeFile)) || useTheme != lastUseTheme) {
    lastThemeFile = themeFile
    lastUseTheme = useTheme
    let currentThemeLink = $("#theme")
    if (currentThemeLink) {
      currentThemeLink.remove()
    }
    if (useTheme) {
      let head  = document.getElementsByTagName('head')[0];
      let link  = document.createElement('link');
      link.id   = 'theme';
      link.rel  = 'stylesheet';
      link.type = 'text/css';
      let themePath = runFromSource ? "themes/" : "../../../themes/";
      link.href = themePath + lastThemeFile;
      head.appendChild(link)
    }
  }
})

console.timeEnd('init')