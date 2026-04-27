from flask import Blueprint, jsonify, request, session

dashboard_bp = Blueprint('dashboard', __name__)


def _as_list(value):
    return value if isinstance(value, list) else []


# ------------------ CORE ------------------

@dashboard_bp.route('/health/status', methods=['GET'])
def health_status():
    return jsonify({
        "status": "ok",
        "message": "Dashboard backend funcionando",
        "checks": {
            "backend": True,
            "database": True,
            "instagram": False,
            "facebook": False,
            "tiktok": False,
            "linkedin": False,
            "youtube": False
        }
    })


@dashboard_bp.route('/status', methods=['GET'])
def status_alias():
    return health_status()


# ------------------ SETTINGS ------------------

@dashboard_bp.route('/settings', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def settings():
    if request.method == 'GET':
        current = session.get("settings", {})
        if not isinstance(current, dict):
            current = {}

        current.setdefault("aiEnabled", False)
        current.setdefault("frequency", None)

        return jsonify(current)

    if request.method == 'DELETE':
        session["settings"] = {}
        session.permanent = True
        return jsonify({"success": True})

    data = request.get_json(silent=True) or {}
    current = session.get("settings", {})

    if not isinstance(current, dict):
        current = {}

    current.update(data)

    session["settings"] = current
    session.permanent = True

    return jsonify(current)


# ------------------ SOCIAL ------------------

@dashboard_bp.route('/social-accounts', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def social_accounts():
    accounts = _as_list(session.get("social_accounts", []))

    if request.method == 'GET':
        return jsonify(accounts)

    if request.method == 'DELETE':
        session["social_accounts"] = []
        session.permanent = True
        return jsonify([])

    data = request.get_json(silent=True) or {}

    account = {
        "id": len(accounts) + 1,
        "platform": data.get("platform") or data.get("provider") or data.get("network"),
        "connected": data.get("connected", True),
        **data
    }

    accounts.append(account)
    session["social_accounts"] = accounts
    session.permanent = True

    return jsonify(accounts), 201


# ------------------ POSTS ------------------

@dashboard_bp.route('/posts', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def posts():
    posts_list = _as_list(session.get("posts", []))

    if request.method == 'GET':
        return jsonify(posts_list)

    if request.method == 'DELETE':
        session["posts"] = []
        session.permanent = True
        return jsonify([])

    data = request.get_json(silent=True) or {}

    post = {
        "id": len(posts_list) + 1,
        "status": data.get("status", "draft"),
        **data
    }

    posts_list.append(post)
    session["posts"] = posts_list
    session.permanent = True

    return jsonify(posts_list), 201


# ------------------ APPROVALS ------------------

@dashboard_bp.route('/approvals', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def approvals():
    approvals_list = _as_list(session.get("approvals", []))

    if request.method == 'GET':
        return jsonify(approvals_list)

    if request.method == 'DELETE':
        session["approvals"] = []
        session.permanent = True
        return jsonify([])

    data = request.get_json(silent=True) or {}

    approval = {
        "id": len(approvals_list) + 1,
        "status": data.get("status", "pending"),
        **data
    }

    approvals_list.append(approval)
    session["approvals"] = approvals_list
    session.permanent = True

    return jsonify(approvals_list), 201


# ------------------ SCHEDULE ------------------

@dashboard_bp.route('/schedule', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def schedule():
    schedule_list = _as_list(session.get("schedule", []))

    if request.method == 'GET':
        return jsonify(schedule_list)

    if request.method == 'DELETE':
        session["schedule"] = []
        session.permanent = True
        return jsonify([])

    data = request.get_json(silent=True) or {}

    item = {
        "id": len(schedule_list) + 1,
        **data
    }

    schedule_list.append(item)
    session["schedule"] = schedule_list
    session.permanent = True

    return jsonify(schedule_list), 201


# ------------------ SUPPORT ------------------

@dashboard_bp.route('/unread', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def unread():
    unread_list = _as_list(session.get("unread", []))

    if request.method == 'GET':
        return jsonify(unread_list)

    if request.method == 'DELETE':
        session["unread"] = []
        session.permanent = True
        return jsonify([])

    data = request.get_json(silent=True) or {}

    item = {
        "id": len(unread_list) + 1,
        "read": False,
        **data
    }

    unread_list.append(item)
    session["unread"] = unread_list
    session.permanent = True

    return jsonify(unread_list), 201


@dashboard_bp.route('/support/unread', methods=['GET'])
def support_unread():
    unread_list = _as_list(session.get("unread", []))
    return jsonify(unread_list)


# ------------------ NUEVOS ENDPOINTS (FIX 405) ------------------

@dashboard_bp.route('/caption-addons', methods=['GET'])
def caption_addons():
    return jsonify([])


@dashboard_bp.route('/media', methods=['GET'])
def media():
    return jsonify([])


@dashboard_bp.route('/music', methods=['GET'])
def music():
    return jsonify([])


@dashboard_bp.route('/fonts', methods=['GET'])
def fonts():
    return jsonify([])


@dashboard_bp.route('/me', methods=['GET'])
def me_alias():
    user = session.get("user")
    return jsonify(user or {})


# ------------------ ALERTS ------------------

@dashboard_bp.route('/alerts', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def alerts():
    alerts_list = _as_list(session.get("alerts", []))

    if request.method == 'GET':
        return jsonify(alerts_list)

    if request.method == 'DELETE':
        session["alerts"] = []
        session.permanent = True
        return jsonify([])

    data = request.get_json(silent=True) or {}

    alert = {
        "id": len(alerts_list) + 1,
        "status": data.get("status", "active"),
        **data
    }

    alerts_list.append(alert)
    session["alerts"] = alerts_list
    session.permanent = True

    return jsonify(alerts_list), 201


# ------------------ GENERADOR MASIVO (FIX 405) ------------------

@dashboard_bp.route('/niches', methods=['GET'])
def niches():
    return jsonify([])


@dashboard_bp.route('/packages', methods=['GET'])
def packages():
    return jsonify([])


@dashboard_bp.route('/elements', methods=['GET'])
def elements():
    business_id = request.args.get("businessId")
    return jsonify([])
