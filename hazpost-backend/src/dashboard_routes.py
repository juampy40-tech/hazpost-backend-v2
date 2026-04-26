from flask import Blueprint, jsonify, request, session

dashboard_bp = Blueprint('dashboard', __name__)


# ============================================================
# HEALTH STATUS (dashboard)
# ============================================================
@dashboard_bp.route('/health/status', methods=['GET'])
def health_status():
    return jsonify({
        "status": "ok",
        "message": "Dashboard backend funcionando"
    })


# ============================================================
# SETTINGS
# ============================================================
@dashboard_bp.route('/settings', methods=['GET', 'PUT'])
def settings():
    if request.method == 'GET':
        return jsonify({
            "settings": session.get("settings", {})
        })

    data = request.get_json(silent=True) or {}
    session["settings"] = data
    session.permanent = True

    return jsonify({
        "success": True,
        "settings": data
    })


# ============================================================
# SOCIAL ACCOUNTS
# ============================================================
@dashboard_bp.route('/social-accounts', methods=['GET', 'POST'])
def social_accounts():
    if request.method == 'GET':
        return jsonify({
            "accounts": session.get("social_accounts", [])
        })

    data = request.get_json(silent=True) or {}
    accounts = session.get("social_accounts", [])

    account = {
        "id": len(accounts) + 1,
        **data
    }

    accounts.append(account)
    session["social_accounts"] = accounts
    session.permanent = True

    return jsonify({
        "success": True,
        "account": account
    }), 201


# ============================================================
# POSTS
# ============================================================
@dashboard_bp.route('/posts', methods=['GET', 'POST'])
def posts():
    if request.method == 'GET':
        return jsonify({
            "posts": session.get("posts", [])
        })

    data = request.get_json(silent=True) or {}
    posts_list = session.get("posts", [])

    post = {
        "id": len(posts_list) + 1,
        "status": "draft",
        **data
    }

    posts_list.append(post)
    session["posts"] = posts_list
    session.permanent = True

    return jsonify({
        "success": True,
        "post": post
    }), 201


# ============================================================
# APPROVALS (cola de aprobación)
# ============================================================
@dashboard_bp.route('/approvals', methods=['GET', 'POST'])
def approvals():
    if request.method == 'GET':
        return jsonify({
            "approvals": session.get("approvals", [])
        })

    data = request.get_json(silent=True) or {}
    approvals_list = session.get("approvals", [])

    approval = {
        "id": len(approvals_list) + 1,
        "status": "pending",
        **data
    }

    approvals_list.append(approval)
    session["approvals"] = approvals_list
    session.permanent = True

    return jsonify({
        "success": True,
        "approval": approval
    }), 201


# ============================================================
# SCHEDULE (calendario)
# ============================================================
@dashboard_bp.route('/schedule', methods=['GET', 'POST'])
def schedule():
    if request.method == 'GET':
        return jsonify({
            "schedule": session.get("schedule", [])
        })

    data = request.get_json(silent=True) or {}
    schedule_list = session.get("schedule", [])

    item = {
        "id": len(schedule_list) + 1,
        **data
    }

    schedule_list.append(item)
    session["schedule"] = schedule_list
    session.permanent = True

    return jsonify({
        "success": True,
        "item": item
    }), 201
