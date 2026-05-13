"""Authentication and session routes."""


def _public_login_user_payload(user, email: str, display_name: str, status_fallback: str):
    return {
        "id": str(user.get("id") or ""),
        "email": email,
        "display_name": str(user.get("display_name") or display_name),
        "role": str(user.get("role") or "USER"),
        "status": str(user.get("status") or status_fallback),
    }


def register_auth_routes(app, deps):
    @app.get("/api/auth/config")
    def api_auth_config():
        return deps.json_response(
            {
                "success": True,
                "google_client_id": deps.google_client_id,
                "allowed_domains": deps.allowed_email_domains,
                "local_manual_login_enabled": deps.is_local_manual_login_allowed(),
                "local_manual_login_username_hint": (
                    deps.local_manual_login_username if deps.is_local_manual_login_allowed() else ""
                ),
            }
        )

    @app.post("/api/auth/google-login")
    def api_auth_google_login():
        payload = deps.read_json_payload()
        id_token_raw = str(payload.get("id_token", "") or "")

        try:
            token_info = deps.verify_google_token(id_token_raw)
        except Exception as exc:
            deps.record_audit(
                event_type="auth_login_failed",
                metadata={"reason": str(exc)},
            )
            return deps.json_response(deps.error_payload("AUTH_INVALID_TOKEN", str(exc)), status=401)

        email = str(token_info.get("email", "") or "").strip().lower()
        if "@" not in email:
            deps.record_audit(event_type="auth_login_failed", metadata={"reason": "missing_email"})
            return deps.json_response(deps.error_payload("AUTH_EMAIL_MISSING", "Google account email is missing"), status=401)

        if not bool(token_info.get("email_verified", False)):
            deps.record_audit(event_type="auth_login_failed", metadata={"reason": "email_not_verified", "email": email})
            return deps.json_response(deps.error_payload("AUTH_EMAIL_UNVERIFIED", "Google account email is not verified"), status=401)

        domain = email.rsplit("@", 1)[-1].lower().strip()
        if domain not in deps.allowed_email_domains:
            deps.record_audit(
                event_type="auth_login_blocked_domain",
                metadata={"email": email, "domain": domain},
            )
            return deps.json_response(
                deps.error_payload("AUTH_DOMAIN_BLOCKED", "This email domain is not allowed"),
                status=403,
            )

        google_sub = str(token_info.get("sub", "") or "").strip()
        if not google_sub:
            return deps.json_response(deps.error_payload("AUTH_SUB_MISSING", "Token subject missing"), status=401)

        display_name = str(token_info.get("name", "") or email.split("@", 1)[0]).strip()
        deps.store.bootstrap_admin_roles(deps.admin_emails)

        user = deps.store.upsert_google_user(
            email=email,
            google_sub=google_sub,
            display_name=display_name,
            domain=domain,
            admin_emails=deps.admin_emails,
        )

        if str(user.get("status") or deps.status_active) != deps.status_active:
            deps.record_audit(
                event_type="auth_login_blocked_inactive",
                actor_user_id=str(user.get("id") or ""),
                metadata={"email": email},
            )
            return deps.json_response(deps.error_payload("AUTH_USER_INACTIVE", "User access is inactive"), status=403)

        session_id = deps.store.create_session(
            user_id=str(user.get("id") or ""),
            ttl_hours=deps.session_ttl_hours,
            ip_address=deps.get_client_ip(),
            user_agent=deps.get_user_agent(),
        )

        deps.record_audit(
            event_type="auth_login_success",
            actor_user_id=str(user.get("id") or ""),
            metadata={"email": email, "role": str(user.get("role") or "USER")},
        )

        return deps.json_response(
            {
                "success": True,
                "user": _public_login_user_payload(user, email, display_name, deps.status_active),
                "allowed_domains": deps.allowed_email_domains,
            },
            session_id=session_id,
        )

    @app.post("/api/auth/local-login")
    def api_auth_local_login():
        if not deps.is_local_manual_login_allowed():
            deps.record_audit(
                event_type="auth_local_login_blocked",
                metadata={"reason": "manual_login_disabled", "client_ip": deps.get_client_ip()},
            )
            return deps.json_response(
                deps.error_payload("AUTH_LOCAL_LOGIN_DISABLED", "Local manual login is disabled"),
                status=403,
            )

        payload = deps.read_json_payload()
        username = str(payload.get("username", "") or "").strip()
        password = str(payload.get("password", "") or "")
        if username != deps.local_manual_login_username or password != deps.local_manual_login_password:
            deps.record_audit(
                event_type="auth_local_login_failed",
                metadata={"reason": "invalid_credentials", "username": username[:64]},
            )
            return deps.json_response(
                deps.error_payload("AUTH_INVALID_CREDENTIALS", "Invalid local login credentials"),
                status=401,
            )

        deps.store.bootstrap_admin_roles(deps.admin_emails)
        admin_email = deps.admin_emails[0] if deps.admin_emails else "admin@conwiz.in"
        domain = admin_email.rsplit("@", 1)[-1].lower().strip() if "@" in admin_email else "conwiz.in"
        user = deps.store.upsert_google_user(
            email=admin_email,
            google_sub="local_manual_admin",
            display_name="Local Admin",
            domain=domain,
            admin_emails=deps.admin_emails or [admin_email],
        )

        if str(user.get("status") or deps.status_active) != deps.status_active:
            deps.record_audit(
                event_type="auth_local_login_blocked",
                actor_user_id=str(user.get("id") or ""),
                metadata={"reason": "user_inactive", "email": admin_email},
            )
            return deps.json_response(deps.error_payload("AUTH_USER_INACTIVE", "User access is inactive"), status=403)

        session_id = deps.store.create_session(
            user_id=str(user.get("id") or ""),
            ttl_hours=deps.session_ttl_hours,
            ip_address=deps.get_client_ip(),
            user_agent=deps.get_user_agent(),
        )
        deps.record_audit(
            event_type="auth_local_login_success",
            actor_user_id=str(user.get("id") or ""),
            metadata={"email": admin_email, "role": str(user.get("role") or "USER")},
        )
        return deps.json_response(
            {
                "success": True,
                "user": _public_login_user_payload(user, admin_email, "Local Admin", deps.status_active),
                "manual_login": True,
            },
            session_id=session_id,
        )

    @app.get("/api/auth/me")
    def api_auth_me():
        context, auth_response = deps.require_auth_context()
        if auth_response is not None:
            return auth_response
        return deps.json_response(
            {"success": True, "user": deps.public_user_payload(context)},
            session_id=context.session_id,
        )

    @app.post("/api/auth/logout")
    def api_auth_logout():
        session_id = deps.get_session_id_from_request()
        context = deps.store.get_session_context(session_id) if session_id else None

        if session_id:
            deps.store.revoke_session(session_id)
        if context:
            deps.record_audit(event_type="auth_logout", actor_user_id=context.user_id)

        return deps.json_response({"success": True}, clear_session=True)
