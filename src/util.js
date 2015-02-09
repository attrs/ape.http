var chalk = require('chalk');
var http = require('http');
var Url = require('url');
var EventEmitter = require('events').EventEmitter;

function error(category, err) {	
	var arg = [].slice.call(arguments);
	
	category = category || 'unknown';
	category = Array.isArray(category) ? category : [category];
	category = '[' + category.join(' ') + ']';
	
	arg[0] = chalk.gray.bold(category);
	
	var stack;
	if( err instanceof Error ) {
		arg[1] = chalk.red(err.name + ': ') + chalk.bold(err.message);
		stack = err.stack.split(err.name + ': ' + err.message + '\n').join('');
	} else {
		arg[1] = chalk.red('Error: ') + chalk.bold(err);
		err = new Error();
		stack = err.stack.split(err.name + '\n').join('');
		stack = stack.substring(stack.indexOf('\n') + 1);
	}
	
	console.log();
	console.error.apply(console.error, arg);
	if( stack ) console.error(chalk.white(stack) + '\n');
}

function warn(category, msg) {	
	var arg = [].slice.call(arguments);
	category = category || 'unknown';
	category = Array.isArray(category) ? category : [category];
	category = '[' + category.join(' ') + ']';
	
	arg[0] = chalk.gray.bold(category);
	arg[1] = chalk.red('WARN: ') + chalk.bold(msg);
	
	console.log();
	console.warn.apply(console.warn, arg);
}

function debug(category, msg) {
	var arg = [].slice.call(arguments);
	category = category || 'unknown';
	category = Array.isArray(category) ? category : [category];
	category = '[' + category.join(' ') + ']';
	
	arg[0] = chalk.gray.bold(category);
	arg[1] = chalk.white(msg);
	
	console.log.apply(console.log, arg);
}

function readonly(o, name, value, enumerable) {
	var cfg = {
		enumerable: enumerable === false ? false : true,
		configurable: false,
		writable: false
	};
	if( value !== undefined && value !== null ) cfg.value = value;
	
	Object.defineProperty(o, name, cfg);
}

function getset(o, name, gettersetter, enumerable) {
	Object.defineProperty(o, name, {
		get: gettersetter.get,
		set: gettersetter.set,
		enumerable: enumerable === true ? false : true,
		configurable: false			
	});
}

function mix() {
	var result = {};
	[].slice.call(arguments).forEach(function(arg) {
		if( !arg ) return;
		if( typeof arg !== 'object' ) return warn('util', 'mix element must be an object', arg);
		for(var k in arg) {
			if( arg.hasOwnProperty(k) ) {
				var value = arg[k];
				if( value === mix.remove ) delete result[k];
				else result[k] = arg[k];
			}
		}
	});	
	return result;
}
mix.remove = {};

function createErrorType(name) {
	function CustomError(message, cause) {
		if( message instanceof Error ) {
			cause = message;
			message = message.message;
		}
		
		Error.call(this, message);
		this.name = name;
		this.message = message;
		this.arguments = [].slice.call(arguments);
		
		Error.captureStackTrace(this, arguments.callee);
	
		if( cause instanceof Error ) this.cause = cause;
	}

	CustomError.prototype = Object.create(Error.prototype);
	CustomError.prototype.constructor = CustomError;
	return CustomError;
}

function forward(options, req, res) {
	options = options || {};
	options = typeof options === 'string' ? Url.parse(options) : options;
	
	var hostname = req.headers.host.split(':').filter(Boolean);
	var port = req.headers['x-forwarded-port'] || hostname[1] || (req.protocol === 'http' ? 80 : (req.protocol === 'https' ? 443 : null));
	hostname = hostname[0];

	var forwarded = (req.headers['x-forwarded-for'] || '').split(/ *, */).filter(Boolean);
	forwarded.push(hostname);

	var forwardedPath = req.originalUrl.substring(0, req.originalUrl.indexOf(req.url));
	var protocol = req.headers['x-forwarded-proto'] || req.headers['x-forwarded-protocol']  || req.protocol;

	// according to http://httpd.apache.org/docs/2.2/mod/mod_proxy.html
	options.headers  = util.mix({}, req.headers, {
		'host': util.mix.remove,
		'accept-encoding': util.mix.remove,	
		'x-forwarded-proto': protocol,
		'x-forwarded-protocol': protocol,
		'x-forwarded-port': port,
		'x-forwarded-for': forwarded,
		'x-forwarded-host': req.headers['x-forwarded-host'] || forwarded[0] || hostname,
		'x-forwarded-server': hostname,
		'x-forwarded-path': forwardedPath,
		'x-forwarded-location': req.originalUrl
	}, options.headers || {});
	
	var ee = new EventEmitter();
	
	ee.emit('try', request);
	var request = http.request(options, function(response) {
		ee.emit('response', request, response);
		
		if( response.statusCode >= 400 ) {
			var payload = '';
			response.on('data', function (chunk) {
				payload += chunk;
			});
			response.on('end', function () {
				var eventtype = response.statusCode === 404 ? 'notfound' : 'errorstatus';
				ee.emit(eventtype, request, response, payload);
			});
			return;
		} else {
			ee.emit('success', request, response);
		}
		
		if( res ) {
			res.statusCode = response.statusCode;
			response.setEncoding(options.encoding || 'utf8');
			res.headers = response.headers;
			for(var k in response.headers) {
				res.setHeader(k, response.headers[k]);
			}
			
			response.pipe(res);
		} else {
			response.on('data', function (chunk) {
				ee.emit('end', request, response);
			});
		}
		
		response.on('end', function () {
			ee.emit('end', request, response);
		});
		//response.end();
	});
	req.on('error', function(err) {
		ee.emit('error', err, request);
	});
	req.pipe(request, {end:true});
	
	return ee;
}

var util = module.exports = {
	error: error,
	warn: warn,
	debug: debug,
	readonly: readonly,
	getset: getset,
	mix: mix,
	createErrorType: createErrorType,
	forward: forward
};