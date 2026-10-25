<?php

namespace OCA\SystemMonitor\AppInfo;

use OCP\AppFramework\App;

class Application extends App {
    public const APP_ID = 'system_monitor';

    public function __construct() {
        parent::__construct(self::APP_ID);
    }
}
