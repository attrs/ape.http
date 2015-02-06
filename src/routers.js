var express = require('express');
var uuid = require('uuid');
var fs = require('fs');
var path = require('path');

function cors(options) {
	options = options || {};
	return function(req, res, next){
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
	cors: cors,
	accesslog: accesslog,
	errorlog: errorlog,
	errorsend: errorsend
};