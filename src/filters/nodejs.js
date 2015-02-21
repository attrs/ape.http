var path = require('path');
var fs = require('fs');
var util = require('attrs.util');
var cons = require('consolidate');
var Server = require('../Server.js');

function nodejs(req, res, next) {
	//console.log('nodejs filter called', req.docbase, req.path);
	if( !req.docbase ) return next();
	
	var controller = path.join(req.docbase, req.path);
	if( !fs.existsSync(controller) ) return next();
		
	var prog;
	try {
		if( require.cache[controller] ) delete require.cache[controller];
		prog = require(controller);
		
		if( typeof prog !== 'function' ) return next(new TypeError('exports must be a function(req, res, next), "' + controller + '"'));
		
		res.set('Content-Type', 'text/html');
		prog(req, res, next);
	} catch(err) {
		return next(err);
	}
}

function views(req, res, next) {
	if( !req.docbase ) return next();
		
	var view = path.join(req.docbase, req.path);
	var controller = path.join(req.docbase, req.path + '.js');
	var ext = req.path.substring(req.path.lastIndexOf('.') + 1);
	
	var onext = next;
	var orender = res.render;
	var next = function(err) {
		res.render = orender;
		if( err ) return onext(err);
		onext();
	};
	
	res.render = function(vo) {
		if( typeof vo === 'object' ) return orender(view, vo, function(err, html) {
			if( err ) return next(err);
			res.send(html);
		});
		
		return orender.apply(res, arguments);
	};
	
	if( fs.existsSync(controller) ) {
		var prog;
		try {
			if( require.cache[controller] ) delete require.cache[controller];
			prog = require(controller);
		
			if( typeof prog !== 'function' ) return next(new TypeError('exports must be a function(req, res, next), "' + controller + '"'));
			
			res.set('Content-Type', 'text/html');
			prog(req, res, next);
		} catch(err) {
			return next(err);
		}
	} else if( fs.existsSync(view) ) {
		cons[ext](view, {}, function(err, html){
			if( err ) return next(err);
			res.send(html);
		});
	} else {
		next();
	}
}

if( Server ) {
	Server.filter('nodejs', {
		pattern: ['**/*.njs', '**/*.node.js'],
		filter: nodejs
	});

	Server.filter('views', {
		pattern: ['**/*.jade', '**/*.ejs', '**/*.swig', '**/*.haml'],
		filter: views
	});
}

return {
	nodejs: nodejs,
	views: views
};