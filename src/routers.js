var express = require('express');
var uuid = require('uuid');
var fs = require('fs');
var path = require('path');
var minimatch = require('minimatch');
var util = require('./util.js');

function forward(config) {
	var config = (typeof config === 'string' ? {forward:config} : config);
	
	return function forward(req, res, next) {
		if( !config ) return next();
		
		var request = http.request({
			url: Url.parse(config.forward),
			headers: req.headers,
			method: req.method
		}, function(response) {
			response.pipe(res, {end:true});
		});
		req.pipe(request, {end:true});
	};
}

function docbase(config) {
	config = config || {};

	var Server = require('./Server.js');
	
	return function docbase(req, res, next) {	
		var origindocbase = req.docbase;
		var docbase;
				
		if( typeof config.docbase === 'object' ) {
			docbase = config.docbase[req.hostname] || config.docbase['*'];
		} else if( typeof config.docbase === 'string' ) {
			docbase = config.docbase;
			if( req.vhost && ~base.indexOf(':') ) {
				docbase = docbase.split(':1').join(req.vhost[0])
				.split(':2').join(req.vhost[1])
				.split(':3').join(req.vhost[2])
				.split(':4').join(req.vhost[3])
				.split(':5').join(req.vhost[4]);
			}
		}
		
		var filterchain = [];
		
		// server filter
		for(var pattern in config.filters) {
			var filter = config.filters[pattern];
		
			if( minimatch(req.url, pattern) ) {
				if( filter === false ) filterchain.push(false);
				else if( filter === 'string' ) Server.filters[filter] ? filterchain.push(Server.filters[filter].filter) : null;
				else if( typeof filter === 'function' ) filterchain.push(filter);
				else if( Array.isArray(filter) ) filterchain = filterchain.concat(filterchain, filter);
			}
		}
		
		// global filter
		for(var pattern in Server.filtermapping) {
			var filter = Server.filtermapping[pattern];
		
			if( minimatch(req.url, pattern) ) {
				if( filter === false ) filterchain.push(false);
				else if( typeof filter === 'function' ) filterchain.push(filter);
				else if( Array.isArray(filter) ) filterchain = filterchain.concat(filterchain, filter);
			}
		}
		
		if( config.debug ) util.debug(req.server, 'docbase(' + docbase + ')', req.url, filterchain);
		
		req.docbase = docbase;
		
		var index = 0;
		var dispatch = function() {
			var fn = filterchain[index++];
			if( fn === false ) {
				next();
			} else if( fn ) {
				fn(req, res, function(err) {
					if( err ) return next(err);
					dispatch();
				});
			} else {
				if( docbase ) express.static(docbase)(req, res, next);
				else next();
			}
		};
		dispatch();
		
		req.docbase = origindocbase;
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
	docbase: docbase,
	cors: cors,
	accesslog: accesslog,
	errorlog: errorlog,
	errorsend: errorsend
};