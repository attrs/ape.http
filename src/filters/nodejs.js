var path = require('path');

var filter = module.exports = function njs(req, res, next) {
	//console.log('nodejs filter called', req.docbase, req.path);
	var uri = path.resolve(req.docbase + req.path);
	
	var prog;
	try {
		if( require.cache[uri] ) delete require.cache[uri];
		prog = require(uri);
	} catch(err) {
		next();
	}
	
	try {
		prog(req, res, next);
	} catch(err) {
		next(err);
	}
};


// bundle filter
require('../Server.js').filter('nodejs', {
	pattern: ['**/*.njs', '**/*.node.js', '**/*.jade', '**/*.ejs', '**/*.swig', '**/*.haml'],
	filter: filter
});