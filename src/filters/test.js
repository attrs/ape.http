module.exports = {
	execute: function(req, res, next) {
		console.log('test filter called', req.docbase, req.uri);
	}
};