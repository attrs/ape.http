var express = require('express');
var multer = require('multer');
var bodyparser = require('body-parser');
var favicon = require('serve-favicon');
var methodoverride = require('method-override');
var session = require('express-session');
var csurf = require('csurf');
var compression = require('compression');
var cookieparser = require('cookie-parser');
var cookiesession = require('cookie-session');
var vhost = require('vhost');

var colors = require('colors');
var fs = require('fs');
var path = require('path');
var uuid = require('uuid');
var https = require('https');
var http = require('http');

var app = express();
var vhosts = express();
var common = express();

app.set('port', 9090);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// access logging
app.use(function(req, res, next) {
	console.log('write access log');
	next();
});

app.use(methodoverride());
app.use(session({ secret: 'uwotm8' }));
app.use(bodyparser.json());
app.use(bodyparser.urlencoded({ extended: true }));
app.use(multer());
app.use(csurf());

app.use(vhosts);
app.use(common);

// not found throw
app.use(function(req, res, next) {
	next(404);
});

// error logging
app.use(function(err, req, res, next){
	console.log('write error log:', err);
	if( err.stack ) console.log(err.stack);
	
	if( typeof(err) === 'number' ) res.status(err).sendStatus(err);
	else if( err.stack ) res.status(500).send(err.stack);
	else res.status(500).send(err + '');
});


// mount common : vhost 에서 찾지 못할 경우, 여기서 찾는다.
//common.use('/', express.static(path.join(__dirname, 'www')));
common.use('/error.html', function(req, res, next) {
	next(500);
});
common.use(docbase(__dirname, {
	'common': 'www/common',
	'mobile': 'www/mobile',
	'*': 'www/web'
}));
common.use('/test', docbase(__dirname, 'www/common'));

function docbase(basedir, options) {
	if( arguments.length === 1 ) {
		if( typeof(basedir) === 'string' ) {
			return express.static(basedir);
		} else {
			options = basedir;
			basedir = null;
		}
	}
	
	if( !basedir ) basedir = '';
	
	var dirs = {};
	if( typeof(options) === 'string' ) {
		return express.static(path.resolve(basedir, options));
	} else if( typeof(options) === 'object' ) {		
		for(var k in options) {
			dirs[k] = options[k] ? express.static(path.resolve(basedir, options[k])) : null;
		}
	} else {
		throw new Error('illegal docbase options');
	}
	
	var routers = [];	
	routers.push(function(req, res, next) {
		//var ua = req.get('User-Agent');
		var ua = req.query.ua;
		if( dirs[ua] ) dirs[ua](req, res, next);
		else if( dirs['*'] ) dirs['*'](req, res, next);
		else next();
	});
	
	if( dirs.common ) {
		routers.push(function(req, res, next) {
			dirs.common(req, res, next);
		});
	}
	return routers;		
}

// vhost test
var attrsio = express();
attrsio.use(express.static(path.join(__dirname, 'www.attrs')));
vhosts.use(vhost('attrs.io', attrsio));

var attrsio = express();
attrsio.use(express.static(path.join(__dirname, 'www.joje')));
vhosts.use(vhost('joje.attrs.io', attrsio));


// open httpd
var httpd = http.createServer(app);
httpd.on('error', function (e) {
	console.log('httpd listen failure', e);
});

httpd.listen(app.get('port'), function() {				
	console.log('HTTP Server listening on port ' + app.get('port'));
});
