"""Route registration package for the deployable web app."""

from .admin_routes import register_admin_routes
from .assistant_routes import register_assistant_routes
from .auth_routes import register_auth_routes
from .diagnostic_routes import register_diagnostic_routes
from .legacy_routes import register_legacy_routes
from .page_routes import register_page_routes, register_static_routes
from .task_routes import register_task_routes


def register_routes(app, deps):
    """Register all Bottle routes in dependency-safe order."""
    register_page_routes(app, deps)
    register_diagnostic_routes(app, deps)
    register_auth_routes(app, deps)
    register_task_routes(app, deps)
    register_assistant_routes(app, deps)
    register_legacy_routes(app, deps)
    register_admin_routes(app, deps)
    register_static_routes(app, deps)
