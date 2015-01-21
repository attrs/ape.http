var express = require('express');
var multer = require('multer');
var bodyparser = require('body-parser');
var uuid = require('uuid');
var fs = require('fs');
var path = require('path');

function vhost(basedir, main, sub) {
	var vhost = require('vhost');
	var router = express();
	
	if( sub ) {
		sub.forEach(function(config) {
			router.use(vhost(config.host, docbase(config.docbase)));
		});
	}
	
	if( main ) router.use(vhost(main.host, docbase(main.docbase)));
	
	return router;
}

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

function bower(options) {
	options = options || {};
	
	var router = express();
	// bower support
	if( options !== false ) {
		require('bower').commands
		.list({ paths: true, json: true })
		.on('end', function (pkgs) {
			var name = pkgs[name];

			var uri = (typeof(bower) === 'string') ? bower : '/bower_components';
			if( uri.indexOf('/') !== 0 ) uri = '/' + uri;
		
			router.use(uri + '/list', function(req, res, next) {
				res.send(pkgs);
			});
		
		    for(var name in pkgs) {									
				var p = path.resolve(process.cwd(), pkgs[name]);
				if( fs.isExistSync(p) && fs.statSync(p).isDirectory() ) {
					router.use(uri + '/' + name, express.static(p));
				} else {
					router.use(uri + '/' + name, express.static(p));
				}
		    }
		});
	}
	
	return router;
}

function charset(options) {
	options = options || {};

	var responseCharset = options.response || options;

	return function(req, res, next){
		if( responseCharset && !res.charset ) res.charset = responseCharset;

		next();
	};
};

function cors(options) {
	return function(req, res, next){
		if( options ) {
			var config = options.get(req);
			if( config ) {
				res.header('Access-Control-Allow-Origin', config.origins.join(','));
				res.header('Access-Control-Allow-Methods', config.methods.join(','));
				res.header('Access-Control-Allow-Headers', config.headers.join(','));
				//res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
				//res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
		
				// intercept OPTIONS method
				if ('OPTIONS' == req.method) {
					res.send(200);
				}
			}
		}
		
		next();
	};
};






function logging(options) {
	options = options || {};
	return function(req, res, next){
		next();
	};
}

// @deprecated
function errorlog(options){
	options = options || {};

	var showStack = options.showStack
		, showMessage = options.showMessage
		, logErrors = options.logErrors
		, logErrorsStream = false;
	
	if(options.logErrors)
		logErrorsStream = fs.createWriteStream(logErrors, {'flags': 'a', encoding: 'utf-8', mode: 0x666});

	return function errorlog(err, req, res, next){		
		var o = err;
		if( typeof(o) === 'string' ) o = {
			message: o,
			stack: 'unknown(reported by string message)'
		};

		var now = new Date();
		var errorId = uuid.v4();

		o.uuid = errorId;
		o.occurred = now;

	    if( showMessage ) console.error(o.message);

		if( logErrors ){
			logErrorsStream.write(now.toJSON() + '[' + errorId + '] ' + o.message + '\n');
			logErrorsStream.write(' - Stack: \n' + o.stack + '\n');

			if( o.detail ) {
				if( o.detail instanceof Error ) {
					logErrorsStream.write(' - Cause: \n' + o.detail.message + '\n');
					logErrorsStream.write(' - Cause Stack: \n' + o.detail.stack + '\n');
				}
			}
		}

		if( showStack ) {
			console.error(now.toJSON() + ' - Error Occured: ' + o.stack + '\n');
			if( o.detail && (o.detail instanceof Error) ) 
				console.error(' - Cause: \n' + o.detail.message + '\n' + o.detail.stack + '\n');
		}

		next(err);
	};
};

// @deprecated
function errorsend(options) {
	var showStack = options.showStack;

	return function errorsend(err, req, res, next) {
		var o = err;
		if( typeof(o) === 'string' ) o = {
			message: o,
			stack: 'unknown(reported by string message)'
		};

		if( !o.timestamp ) o.timestamp = new Date();

		var obj = {
			error: true,
			uuid: o.uuid,
			occurred: o.occurred,
			message: o.message,
			detail: o.detail,
			stack: (showStack ? o.stack : null)
		};

	    res.statusCode = 500;
		var accept = req.headers.accept || '';
	    if (~accept.indexOf('*/*') || ~accept.indexOf('json')) {
			res.setHeader('Content-Type', 'application/json');
			res.send(obj);
		} else {
			res.send(JSON.stringify(obj, null, '\t'));
		}

		//next(err);
	};
};


module.exports = {
	vhost: vhost,
	logging: logging,
	bower: bower,
	docbase: docbase,
	charset: charset,
	cors: cors
	//errorlog: errorlog,
	//errorsend: errorsend
};