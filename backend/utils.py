from functools import wraps

from flask import jsonify, redirect, request, session, url_for


def login_required(f):
    """Decorator that redirects to /login for browsers, returns 401 for API calls."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            if (
                request.is_json
                or request.headers.get("Accept") == "text/event-stream"
                or request.path.startswith("/api/")
            ):
                return jsonify({"error": "Not authenticated"}), 401
            return redirect(url_for("auth.login_page"))
        return f(*args, **kwargs)
    return decorated
