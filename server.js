'use strict';

var express     = require('express');
var bodyParser  = require('body-parser');
var expect      = require('chai').expect;
var cors        = require('cors');

var frameguard = require('frameguard');
var dnsPrefetchControl = require('dns-prefetch-control');
var referrerPolicy = require('referrer-policy');

var apiRoutes         = require('./routes/api.js');
var fccTestingRoutes  = require('./routes/fcctesting.js');
var runner            = require('./test-runner');

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

if (process.env.ENABLE_DEBUGGING == 't') {
  let count = 0;
  app.use(function (req, res, next) {
    count++;
    let str = count + ' ' + req.method + ' ' + req.url;
    const t = Date.now();
    console.log('\nNew request:\n' + str);
    console.log('body:\n', req.body);
    console.log('query:\n', req.query);
    res.on('finish', () => console.log(`\nRequest ended:\n${Date.now() - t}ms ${str}`));
    next();
  });
}

// 1. Only allow your site to be loading in an iFrame on your own pages.
app.use(frameguard({ action: 'sameorigin' }));
// 2. Do not allow DNS prefetching.
app.use(dnsPrefetchControl());
// 3. Only allow your site to send the referrer for your own pages.
app.use(referrerPolicy({ policy: 'same-origin' }));

app.use('/public', express.static(process.cwd() + '/public'));

app.use(cors({origin: '*'})); //For FCC testing purposes only

//Sample front-end
app.route('/b/:board/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/board.html');
  });
app.route('/b/:board/:threadid')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/thread.html');
  });

//Index page (static HTML)
app.route('/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/index.html');
  });

//For FCC testing purposes
fccTestingRoutes(app);

//Routing for API 
apiRoutes(app, () => {

  //Sample Front-end

      
  //404 Not Found Middleware
  app.use(function(req, res, next) {
    res.status(404)
      .type('text')
      .send('Not Found');
  });

  //Start our server and tests!
  app.listen(process.env.PORT || 3000, function () {
    console.log("Listening on port " + process.env.PORT);
    if(process.env.NODE_ENV==='test') {
      console.log('Running Tests...');
      setTimeout(function () {
        try {
          runner.run();
        } catch(e) {
          var error = e;
            console.log('Tests are not valid:');
            console.log(error);
        }
      }, 1500);
    }
  });
});

module.exports = app; //for testing
