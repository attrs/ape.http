var chalk = require('chalk');

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
			if( arg.hasOwnProperty(k) ) result[k] = arg[k];
		}
	});	
	return result;
}

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

module.exports = {
	error: error,
	warn: warn,
	debug: debug,
	readonly: readonly,
	getset: getset,
	mix: mix,
	createErrorType: createErrorType
};