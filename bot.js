//
// This is main file containing code implementing the Express server and functionality for the Express echo bot.
//
'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const path = require('path');
var messengerButton = "<html><head><title>Facebook Messenger Bot</title></head><body><h1>Facebook Messenger Bot</h1>This is a bot based on Messenger Platform QuickStart. For more details, see their <a href=\"https://developers.facebook.com/docs/messenger-platform/guides/quick-start\">docs</a>.<script src=\"https://button.glitch.me/button.js\" data-style=\"glitch\"></script><div class=\"glitchButton\" style=\"position:fixed;top:20px;right:20px;\"></div></body></html>";
var chrono = require('chrono-node');

// The rest of the code implements the routes for our Express server.
let app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));


Date.prototype.addDays = function(days) {
  var dat = new Date(this.valueOf());
  dat.setDate(dat.getDate() + days);
  return dat;
}

var finnishDateParser = new chrono.Parser();

finnishDateParser.pattern = function () { return /[0-9][.][0-9]/ }

finnishDateParser.extract = function(text, ref, match, opt) {
  var parsedDay = parseInt(match[0].split('.')[0], 10);
  var parsedMonth = parseInt(match[0].split('.')[1], 10);
  console.log(888, parsedDay, parsedMonth);
  console.log(777, text, ref, match, opt);
  return new chrono.ParsedResult({
    ref: ref,
    text: text,
    index: match.index,
    start: {
        day: parsedDay,
        month: parsedMonth,
    }
  });
}

var christmasParser = new chrono.Parser();
christmasParser.pattern = function () { return /christmas/i }
christmasParser.extract = function(text, ref, match, opt) {
  return new chrono.ParsedResult({
    ref: ref,
    text: match[0],
    index: match.index,
    start: {
        day: 24,
        month: 12,
    }
  });
}

var custom = new chrono.Chrono();
custom.parsers.push(finnishDateParser);
custom.parsers.push(christmasParser);

// Webhook validation
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

// Display the web page
app.get('/', function(req, res) {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write(messengerButton);
  res.end();
});

// Message processing
app.post('/webhook', function (req, res) {
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object === 'page') {

    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;

      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        if (event.message) {
          receivedMessage(event);
        } else if (event.postback) {
          receivedPostback(event);
        } else {
          console.log("Webhook received unknown event: ", event);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know
    // you've successfully received the callback. Otherwise, the request
    // will time out and we will keep trying to resend.
    res.sendStatus(200);
  }
});

// Incoming events handling
function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:",
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  if(message.text.toLowerCase().indexOf("milloin") >= 0) {
    var stripped = message.text.toLowerCase().replace(/milloin/g, '');
    stripped = stripped.replace(/nimipäivät/g, '');
    stripped = stripped.replace(/nimipäivä/g, '');
    stripped = stripped.replace(/ on/g, '');
    stripped = stripped.replace(/\s+/g, '');
    var attempt = "";
    var lastChar = stripped.charAt(stripped.length-1);
    if(lastChar == "n") {
      attempt = stripped.slice(0, stripped.length-1);
      var letter = attempt[attempt.length-2];
      if(letter == "k" || letter == "p" || letter == "t") {
        var firstpart = attempt.substring(0, attempt.length-1);
        firstpart = firstpart + letter + attempt[attempt.length-1];
        stripped = firstpart;
      } else {
        stripped = attempt;
      }
    }

    sendNameBasedMessage(stripped, senderID);

  } else {
    var messageContent = "Pahoittelut, ongelma!";

    request.post({
      uri: 'https://translation.googleapis.com/language/translate/v2?key=' + process.env.TRANSLATE_API_KEY,
      qs: {
        'q': message.text,
        'target': 'en'
      },

    }, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var JSONresp = JSON.parse(body);
        var chronoDate = custom.parseDate(JSONresp.data.translations[0].translatedText + " is who");
        if(chronoDate == null || isNaN(chronoDate)) {
          sendNameBasedMessage(message.text, senderID);
        } else {
          sendDateBasedMessage(chronoDate, senderID);
        }
      } else {
        console.error("Unable to receive translation.");
      }
    });
  }
}

function sendNameBasedMessage(name, senderID) {
  var messageContent = "";
  request({
    uri: 'https://nimiapi.herokuapp.com/name/' + name,
    qs: {
      api_key: process.env.NAME_API_KEY
    }
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var jsonBody = JSON.parse(body);
      var emoticons = ["💐", "🍀", "👍", "👏", "😄", "☺", "🌻", "🌼", "🌷", "🌹", "🌸"];
      var emoticon = emoticons[(Math.floor(Math.random() * emoticons.length))];
      var phrase = jsonBody.name + " viettää nimipäiviään " + jsonBody.resultMsg;
      if(jsonBody.other_names.length >0) {
        var restOfThePhrase = " juhlii";
        if(jsonBody.other_names.length >1) {
          restOfThePhrase = " juhlivat";
        }
        phrase = phrase + " Myös " + jsonBody.other_names.join(', ') + restOfThePhrase + " silloin.";
      }
      if(jsonBody.celebrations.length >0) {
        phrase = phrase + " 🇫🇮 Silloin on myös liputuspäivä: " + jsonBody.celebrations + " 🇫🇮";
      }

      messageContent = phrase + emoticon;
      sendTextMessage(senderID, messageContent);
    } else {
      console.error("Unable to receive nameday info.");
      sendTextMessage(senderID, ("Koitin etsiä nimellä '" + name.charAt(0).toUpperCase() + name.slice(1) + "' mutta sitä ei löytynyt. :/"));
    }
  });
}

function sendDateBasedMessage(chronoDate, senderID) {
  if(chronoDate == null || isNaN(chronoDate) ) {
    sendTextMessage(senderID, "Virhe nimipäivätietojen haussa!");
  };
  var cmonth = chronoDate.getMonth() + 1;
  var cdate = chronoDate.getDate();
  var messageContent = "";
  request({
    uri: 'https://nimiapi.herokuapp.com/' + cmonth + "/" + cdate,
    qs: {
      api_key: process.env.NAME_API_KEY
    }
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var jsonBody = JSON.parse(body);
      var emoticons = ["💐", "🍀", "👍", "👏", "😄", "☺", "🌻", "🌼", "🌷", "🌹", "🌸"];
      var emoticon = emoticons[(Math.floor(Math.random() * emoticons.length))];
      var phrase = "Nimipäiviään viettävät ";
      if(jsonBody.name.length < 2) {
        phrase = "Nimipäiväänsä viettää ";
      }
      messageContent = phrase + cdate + "." + cmonth + ". " + jsonBody.name.join(', ') + ". " + emoticon;
      sendTextMessage(senderID, messageContent);
    } else {
      console.error("Unable to receive nameday info.");
      sendTextMessage(senderID, "Virhe nimipäivätietojen haussa!");
    }
  });
}

function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " +
    "at %d", senderID, recipientID, payload, timeOfPostback);

  // When a postback is called, we'll send a message back to the sender to
  // let them know it was successful
  sendTextMessage(senderID, "Postback called");
}

//////////////////////////
// Sending helpers
//////////////////////////
function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };

  callSendAPI(messageData);
}

function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: process.env.PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s",
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}

// Set Express to listen out for HTTP requests
var server = app.listen(process.env.PORT || 3000, function () {
  console.log("Listening on port %s", server.address().port);
});