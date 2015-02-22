module.exports = function(req, res, next) {
	req.parse();
	
	res.send('nodejs controller2:' + req.app.server + ':' + req.bucket);
};