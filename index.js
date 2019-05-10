const fs = require("fs");
const { app } = require("electron");
const inbox = require("./inbox");
const menu = require("./menu");

app.on("ready", function() {
  var win = inbox.open("https://gmail.com");
  win.on("close", function() {
    fs.writeFileSync(
      inbox.getBoundsFile(),
      JSON.stringify({
        bounds: win.getBounds()
      })
    );
  });

  const wc = win.webContents;
  wc.on("did-finish-load", () => {
    wc.executeJavaScript(`
      Array.from(document.querySelectorAll('a.gb_yb[href*="/mail/u"]')).forEach((a) => {
        window.open(a.href);
      });
    `);
  });

  menu();
  //badge();
});
