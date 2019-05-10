const fs = require("fs");
const path = require("path");
const URL = require("url");
const { app, BrowserWindow, shell } = require("electron");

const googleHosts = [
  "accounts.google.com",
  "mail.google.com",
  "google-mail.com"
];

let unreadCount = 0;

function getUserId(url) {
  // The `authuser` parameter is present when switching profiles
  var m = url.match(/authuser=(\d)/);

  // ... otherwise the URLs look like this: `/u/<id>`
  if (!m) m = url.match(/\/u\/(\d)/);

  // ... or just `/` for the default user
  return m ? parseFloat(m[1]) : 0;
}

// Returns the window for the given user id
function getUserWindow(id) {
  const all = BrowserWindow.getAllWindows();
  for (var i = 0; i < all.length; i++) {
    const win = all[i];
    const url = win.webContents.getURL();
    if (getUserId(url) == id) return win;
  }
}

function getBrowserWindowBounds() {
  var data;
  try {
    const f = exports.getBoundsFile();
    data = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {}
  return data && data.bounds
    ? data.bounds
    : {
        width: 1024,
        height: 768
      };
}

// Return the main window bounds json file
exports.getBoundsFile = function() {
  return path.join(app.getPath("userData"), "init.json");
};

app.on("web-contents-created", (ev, wc) => {
  wc.on("did-finish-load", () => {
    const url = wc.getURL();
    if (url.match(/view=btop/)) {
      wc.insertCSS(fs.readFileSync(__dirname + "/css/popout.css", "utf8"));
    } else if (url.match(/view=pt/)) {
      wc.insertCSS(fs.readFileSync(__dirname + "/css/print.css", "utf8"));
    } else if (url.startsWith("https://mail.google.com/")) {
      wc.insertCSS(fs.readFileSync(__dirname + "/css/inbox.css", "utf8"));
      updateBadge();
    }
  });
});

exports.open = function open(url, name) {
  // look for an existing window
  const id = getUserId(url);
  let win = getUserWindow(id);
  if (win) {
    win.show();
    return win;
  }
  const windowBounds = getBrowserWindowBounds();
  win = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    show: name != "_minimized",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      nativeWindowOpen: true,
      nodeIntegrationInSubFrames: true
    }
  });

  win.on("page-title-updated", (ev, title) => {
    setTimeout(updateBadge, 100);
  });

  if (name == "_minimized") win.minimize();
  const wc = win.webContents;

  wc.on("dom-ready", function() {
    wc.insertCSS(fs.readFileSync(__dirname + "/css/inbox.css", "utf8"));
    wc.executeJavaScript(`(${patchNotifications}())`);
  });

  wc.on("new-window", function(ev, href, name) {
    const url = URL.parse(href);
    console.log("new window", href);
    if (url.host == "mail.google.com" && !url.search) {
      ev.preventDefault();
      open(href, name);
    } else if (!~googleHosts.indexOf(url.host)) {
      console.log("external");
      ev.preventDefault();
      shell.openExternal(href);
    } else {
      console.log("neither");
    }
  });

  win.loadURL(url);
  return win;
};

function updateBadge() {
  if (app.dock) {
    const count = BrowserWindow.getAllWindows().reduce(function(total, win) {
      return total + getUnreadCount(win);
    }, 0);
    if (count != unreadCount) {
      app.dock.setBadge(`${count || ""}`);
    }
    if (count > unreadCount) {
      app.dock.bounce("informational");
    }
    unreadCount = count;
  }
}

function getUnreadCount(win) {
  const m = /\((\d+)\+?\)/.exec(win.getTitle());
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Monkey-patch the Notification constructor to remove the icon.
 * Without this patch the Gmail icon would be shown twice (as app icon and
 * as contentIcon) which looks pretty weird.
 */
function patchNotifications() {
  const _N = Notification;
  const N = (Notification = function(title, { icon, ...opts } = {}) {
    return new _N(title, opts);
  });
  N.prototype = _N.prototype;
  N.permission = _N.permission;
  N.requestPermission = _N.requestPermission;
}
