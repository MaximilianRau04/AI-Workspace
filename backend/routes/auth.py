from flask import (
    Blueprint,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

import auth_store

bp = Blueprint("auth", __name__)


@bp.route("/login")
def login_page():
    if "user_id" in session:
        return redirect(url_for("main.index"))
    return render_template("login.html")


@bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    user = auth_store.authenticate(username, password)
    if not user:
        return jsonify({"error": "Falscher Benutzername oder Passwort"}), 401

    session.permanent = True
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    return jsonify({"ok": True})


@bp.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if len(username) < 3:
        return jsonify({"error": "Benutzername muss mindestens 3 Zeichen haben"}), 400
    if len(password) < 6:
        return jsonify({"error": "Passwort muss mindestens 6 Zeichen haben"}), 400

    user = auth_store.register(username, password)
    if not user:
        return jsonify({"error": "Benutzername bereits vergeben"}), 409

    session.permanent = True
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    return jsonify({"ok": True})


@bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.route("/me")
def me():
    if "user_id" not in session:
        return jsonify({"error": "Not authenticated"}), 401
    return jsonify({"username": session["username"], "user_id": session["user_id"]})
