<?php

namespace OCA\SystemMonitor\Controller;

use OCA\SystemMonitor\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;

class PageController extends Controller {
    public function __construct(string $AppName, IRequest $request) {
        parent::__construct($AppName, $request);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function index(): TemplateResponse {
        $response = new TemplateResponse(Application::APP_ID, 'main');
        $response->setContentSecurityPolicy(new ContentSecurityPolicy());

        return $response;
    }
}
