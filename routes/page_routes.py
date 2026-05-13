"""HTML shell and static asset routes."""

import re

from bottle import HTTPResponse, static_file


def register_page_routes(app, deps):
    @app.get("/")
    def index():
        return HTTPResponse(status=302, headers={"Location": "/tasks"})

    @app.get("/tasks")
    @app.get("/tasks/")
    def tasks_dashboard_index():
        return deps.render_html_shell("tasks.html", admin_dashboard=False, route_classes=["tasks-dashboard-route"])

    @app.get("/tasks/<task_id>")
    @app.get("/tasks/<task_id>/")
    def task_detail_index(task_id: str):
        safe_task_id = re.sub(r"[^A-Za-z0-9_-]", "", str(task_id or ""))[:128]
        return deps.render_html_shell(
            "task_detail.html",
            admin_dashboard=False,
            route_classes=["task-detail-route"],
            task_route_id=safe_task_id,
        )

    @app.get("/admin-dashboard")
    @app.get("/admin-dashboard/")
    def admin_dashboard_index():
        return deps.render_html_shell("index.html", admin_dashboard=True)

    @app.get("/eel.js")
    def eel_bridge():
        deps.ensure_web_assets()
        asset = static_file("eel_web_bridge.js", root=deps.web_dir, mimetype="application/javascript")
        try:
            asset.set_header("Cache-Control", "no-store, max-age=0, must-revalidate")
            asset.set_header("Pragma", "no-cache")
        except Exception:
            pass
        return asset


def register_static_routes(app, deps):
    @app.get("/<asset_path:path>")
    def serve_static_assets(asset_path: str):
        if asset_path.startswith("api/"):
            return HTTPResponse(status=404, body="Not found")
        return static_file(asset_path, root=deps.web_dir)
