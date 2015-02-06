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

module.exports = {
	error: error,
	warn: warn,
	debug: debug
};