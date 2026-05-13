"""Health, version, runtime telemetry, and runtime settings routes."""


def register_diagnostic_routes(app, deps):
    @app.get("/api/health")
    def api_health():
        return deps.json_response(
            {
                "success": True,
                "status": "ok",
                "storage_backend": deps.store.backend,
                "auth_required": True,
                "version": deps.app_version,
            }
        )

    @app.get("/api/version")
    def api_version():
        return deps.json_response(
            {
                "success": True,
                "version": deps.app_version,
                "asset_version": deps.web_asset_version,
            }
        )

    @app.get("/api/runtime-telemetry")
    @deps.require_auth
    def get_runtime_telemetry():
        context = deps.auth_context_from_request()
        return deps.json_response({"success": True, "telemetry": deps.read_runtime_telemetry(context.session_id)})

    @app.post("/api/runtime-telemetry/reset")
    @deps.require_auth
    def reset_runtime_telemetry():
        context = deps.auth_context_from_request()
        deps.reset_runtime_telemetry(context.session_id)
        return deps.json_response({"success": True})

    @app.post("/api/reset-session")
    @deps.require_auth
    def reset_session():
        context = deps.auth_context_from_request()
        deps.reset_runtime_telemetry(context.session_id)
        return deps.json_response({"success": True})

    @app.get("/api/settings/runtime")
    @deps.require_auth
    def api_runtime_settings():
        context = deps.auth_context_from_request()
        settings = deps.read_global_runtime_settings()
        payload_settings = (
            settings
            if context.role == deps.role_admin
            else deps.global_runtime_settings_for_user_payload(settings)
        )
        return deps.json_response({"success": True, "settings": payload_settings}, session_id=context.session_id)
