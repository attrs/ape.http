var express = require('express');
var fs = require('fs');
var path = require('path');
var minimatch = require('minimatch');
var util = require('attrs.util');
var routers = require('./routers.js');

// class Bucket
function Bucket(id) {
	var docbase, filters = {}, debug = true, staticfirst, indexpage, Server = require('./Server.js');
	
	var body = express.Router();
	var router = function(req, res, next) {
		util.debug([req.app.get('server'), router], 'docbase(' + docbase + ')', req.path);
		
		var obucket = req.bucket;
		req.bucket = router;
		
		routers.docbase({
			label: router,
			debug: debug,
			docbase: docbase,
			indexpage: indexpage,
			staticfirst: staticfirst,
			router: body,
			filtermap: Server.filters,
			filters: util.mix(Server.filtermapping, filters)
		})(req, res, function(err) {
			req.bucket = obucket;
			if( err ) return next(err);
			next();
		});
	};
	
	router.id = id;
	router.toString = function() {
		return 'router:' + (id || 'noname');
	};
	router.staticfirst = function(b) {
		staticfirst = b;
		return this;
	};
	router.docbase = function(doc) {
		docbase = doc;
		return this;
	};
	router.index = function(index) {
		indexpage = index;
		return this;
	};
	router.filter = function(pattern, fn) {
		if( arguments.length === 1 ) return filters[pattern];
		
		if( typeof pattern !== 'string' ) return util.warn('illegal filter pattern', pattern);
		if( typeof fn !== 'string' && typeof fn !== 'function' ) return util.warn('illegal filter fn', pattern, fn);
		
		filters[pattern] = fn;
		
		return this;
	};
	
	
	router.use = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.param = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.all = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.get = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.post = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.put = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.del = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router['delete'] = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.options = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.static = function(uri, file) {
		body.use(uri, express.static(file));
		return this;
	};
	
	router.remove = function(method, path) {
		if( method === 'all' ) method = '_all';
		body.stack.forEach(function(stack) {
			if( stack.path === path && stack.methods[method] ) {
				body.stack.splice(body.stack.indexOf(stack), 1);
			}
		});
		return this;
	};
	
	router.clear = function() {
		body.stack = [];
		return this;
	};
	
	return router;
};

module.exports = Bucket;