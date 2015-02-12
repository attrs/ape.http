var express = require('express');
var uuid = require('uuid');
var fs = require('fs');
var path = require('path');
var minimatch = require('minimatch');

var compression = require('compression');
var bodyparser = require('body-parser');
var xmlparser = require('express-xml-bodyparser');
var typeis = require('type-is');

var util = require('attrs.util');

function forward(config) {	
	return function forward(req, res, next) {
		req.forward = function(options, req, res, next) {
			options = options || {};
			options = typeof options === 'string' ? Url.parse(options) : options;
			options = util.mix({}, config, options);
			
			util.forward(options, req, res)
			.on('error', function(err, request) {
				if( debug ) util.debug(pkg.name, 'error', '://' + request.hostname + ':' + request.port + request.path);
				next(err);
			})
			.on('notfound', function(err, request, response) {
				next(new Error('forward page not found:' + options.url));
			})
			.on('errorstatus', function(err, request, response) {
				next(err);
			})
			.on('response', function(request, response) {
				if( debug ) {
					var status = response.statusCode;
					if( response.statusCode >= 400 ) status = chalk.red(status);
					else status = chalk.green(status);
					
					util.debug('php', status, request.method, '://' + launcher.host + ':' + launcher.port + request.path);
					if( debug === 'detail' ) {
						util.debug(pkg.name, 'request', {
							hostname: request.hostname,
							path: request.path,
							method: req.method,
							port: request.port,
							headers: request.headers
						});
						util.debug('php', 'response', response.headers);
					}
				}
			});
		};
		
		if( config ) req.forward(config, req, res, next);
		else next();
	};
}

function forwarded(config) {
	config = config || {};
	var portmap = util.mix({
		'http': 80,
		'https': 443,
		'ftp': 21
	}, config.portmap || {});
	
	return function forwarded(req, res, next) {
		var headers = req.headers;
		
		var hostname = headers.host.split(':').filter(Boolean);
		var port = headers['x-forwarded-port'] || hostname[1] || portmap[req.protocol];
		hostname = hostname[0];
		
		var forwardedFor = (headers['x-forwarded-for'] || '').split(/ *, */).filter(Boolean);
		req.forwarded = {
			'clientip': forwardedFor[0] || req.connection.remoteAddress,
			'from': req.connection.remoteAddress,
			'port': port,
			'protocol': headers['x-forwarded-proto'] || headers['x-forwarded-protocol'],
			'for': forwardedFor,
			'host': headers['x-forwarded-host'] || forwardedFor[0],
			'server': headers['x-forwarded-server'],
			'path': headers['x-traversal-path'],
			'scriptname': headers['x-forwarded-script-name'] || headers['x-forwarded-path']
		};
		
		next();
	};
}

function compress(config) {
	if( typeof config === 'number' ) config = {threshold: config};
	if( config && typeof config !== 'object' ) config = {};
	
	return function compress(req, res, next) {
		if( config ) {
			compression(config)(req, res, next);
		} else {
			next();
		}
	};
}

function lazyparse() {
	var originalxmlregexp = xmlparser.regexp;// = /^text\/xml$/i;
	
	var bodyparsers = [bodyparser.json(), bodyparser.urlencoded({ extended: true })];
	return function lazyparse(req, res, next) {
		req.parse = function(options, callback) {
			var finish = function(err) {
				if( typeof callback === 'function' ) callback(err);
			};
			
			var index = 0;
			var dispatch = function() {
				var fn = bodyparsers[index++];
				if( fn ) {
					fn(req, res, function(err) {
						if( err ) return finish(err);
						dispatch();
					});
				} else {
					finish();
				}
			};
			dispatch();
		};
		
		req.parse.json = function(options, callback) {
			options = options || {};
			bodyparser.json(options)(req, res, function(err) {
				if( typeof callback === 'function' ) callback(err);
			});
		};
		
		req.parse.text = function(options, callback) {
			options = options || {};
			bodyparser.text(options)(req, res, function(err) {
				if( typeof callback === 'function' ) callback(err);
			});
		};
		
		req.parse.raw = function(options, callback) {
			options = options || {};
			bodyparser.raw(options)(req, res, function(err) {
				if( typeof callback === 'function' ) callback(err);
			});
		};
		
		req.parse.urlencoded = function(options, callback) {
			options = options || {};
			bodyparser.urlencoded(options)(req, res, function(err) {
				if( typeof callback === 'function' ) callback(err);
			});
		};
		
		req.parse.xml = function(options, callback) {
			xmlparser.regexp = /\s*\/\s*/;
			xmlparser(options)(req, res, function(err) {
				xmlparser.regexp = originalxmlregexp;
				
				if( typeof callback === 'function' ) callback(err);
			});
		};
		
		req.typeis = function(type) {
			return typeis(req, type);
		};
		
		req.parse.csurf = function(options, callback) {
			csurf(options)(req, res, function(err) {
				if( typeof callback === 'function' ) callback(err);
			});
		};
		
		req.parse.multipart = function(options, callback) {
			options = options || {};
			options.type = '*/*';
			multer(options)(req, res, function(err) {
				if( typeof callback === 'function' ) callback(err);
			});
		};
		
		next();
	};
}

/*{
	docbase: [docbase:String or Object]
	body: [body router:function]
	filters: [filters:Object]
}*/
function docbase(config) {
	if( typeof config === 'string' ) config = {docbase:config};
	config = config || {};
	
	return function docbase(req, res, next) {	
		var origindocbase = req.docbase;
		var docbase;
				
		if( req.path === '/' && config.indexpage ) {
			if( config.indexpage[0] !== '/' ) config.indexpage = '/' + config.indexpage;
			req.path = config.indexpage;
			req.url = config.indexpage + (req.url.substring(1) || '');
		}
				
		if( typeof config.docbase === 'object' ) {
			docbase = config.docbase[req.hostname] || config.docbase['*'];
		} else if( typeof config.docbase === 'string' ) {
			docbase = config.docbase;
		}
		
		if( docbase ) {
			if( typeof docbase !== 'string' ) return next(new TypeError('invalid docbase:' + docbase));
			
			if( req.vhost && ~docbase.indexOf(':') ) {
				docbase = docbase.split(':1').join(req.vhost[0])
				.split(':2').join(req.vhost[1])
				.split(':3').join(req.vhost[2])
				.split(':4').join(req.vhost[3])
				.split(':5').join(req.vhost[4]);
			}
		}
		
		docbase = docbase ? path.resolve(process.cwd(), docbase) : null;
		
		// confirm filters
		var filterchain = [];
		for(var pattern in config.filters) {
			var filter = config.filters[pattern];
		
			if( minimatch(req.path, pattern) ) {
				var filtermap = config.filtermap || {};
				if( typeof filter === 'string' ) {
					var f = filtermap[filter];
					if( !f ) {
						util.warn(config.label, 'unknwon filter[' + filter + ']');
						continue;
					}
					filter = f.filter;
				}
				
				if( filter === false ) filterchain.push(false);
				else if( typeof filter === 'function' ) filterchain.push(filter);
				else if( Array.isArray(filter) ) filter.forEach(function(fn) { filterchain.push(fn); });
			}
		}
		
		if( config.debug ) util.debug(config.label, (docbase ? '"' + docbase + '"' : '(no docbase)'), req.path, filterchain);
				
		var body = config.router;
		var staticfirst = config.staticfirst;
		
		req.docbase = docbase;
		
		var onext = next;
		next = function(err) {
			if( err ) console.log('error', err);
			req.docbase = origindocbase;
			if( err ) return onext(err);
			onext();
		};
		
		if( filterchain.length <= 0 ) {
			if( docbase && body ) {
				if( config.staticfirst ) {
					express.static(docbase)(req, res, function(err) {
						if( err ) return next(err);
						body(req, res, next);
					});
				} else {
					body(req, res, function(err) {
						if( err ) return next(err);
						express.static(docbase)(req, res, next);
					});
				}
			} else {			
				if( docbase ) express.static(docbase)(req, res, next);
				else if( body ) body(req, res, next);
				else next();
			}
		} else {
			var index = 0;
			var dispatch = function() {
				var fn = filterchain[index++];
				if( fn === false ) {
					if( body ) body(req, res, next);
					else next();
				} else if( fn ) {
					fn(req, res, function(err) {
						if( err ) return next(err);
						dispatch();
					});
				} else {
					if( body ) body(req, res, next);
					else next();
				}
			};
			dispatch();
		}
	};
}

function cors(options) {
	options = options || {};
	return function cors(req, res, next){
		if ('OPTIONS' == req.method) {
			var config = options[req.hostname];
			if( config ) {
				res.header('Access-Control-Allow-Origin', req.hostname);
				res.header('Access-Control-Allow-Methods', config.methods ? config.methods.join(',') : '*');
				res.header('Access-Control-Allow-Headers', config.headers ? config.headers.join(',') : '*');
				res.send();
			}
		}
		
		next();
	};
};

function accesslog(options) {
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

	return function(err, req, res, next){		
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

	return function(err, req, res, next) {
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
	forward: forward,
	forwarded: forwarded,
	lazyparse: lazyparse,
	compress: compress,
	docbase: docbase,
	cors: cors,
	accesslog: accesslog,
	errorlog: errorlog,
	errorsend: errorsend
};