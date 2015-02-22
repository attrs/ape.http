<?php
	session_start();
	
	if( !isset($_SESSION['test']) ) {
		$_SESSION['test'] = 'session-' + mt_rand();
	}
	
	echo '$_SESSION["test"]: ', $_SESSION['test'], '<br>';
	echo '한글<br>';
	echo 'HTTP_HOST: ', $_SERVER["HTTP_HOST"], '<br>';
	echo 'HTTP_X_FORWARDED_HOST: ', $_SERVER["HTTP_X_FORWARDED_HOST"], '<br>';
	echo 'HTTP_X_FORWARDED_PATH: ', $_SERVER["HTTP_X_FORWARDED_PATH"], '<br>';
	echo 'REQUEST_URI: ', $_SERVER['REQUEST_URI'], '<br>';
	echo '$_SERVER: ', $_SERVER, '<br>';
	
	phpinfo();
?>