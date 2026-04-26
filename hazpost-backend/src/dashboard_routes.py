from flask import Blueprint, jsonify, request, session

dashboard_bp = Blueprint('dashboard', __name__)


def _default_social_accounts():
    return {
        "instagram": None,
        "facebook": None,
        "tiktok": None,
        "linkedin": None,
        "youtube": None,
    }


@dashboard_bp.route('/health/status', methods=['GET'])
def health_status():
    return jsonify({
        "status": "ok",
        "message": "Dashboard backend funcionando"
    })


@dashboard_bp.route('/settings', methods=['GET', 'PUT', 'PATCH', 'POST'])
def settings():
    if request.method == 'GET':
        return jsonify({
            "settings": session.get("settings", {})
        })

    data = request.get_json(silent=True) or {}
    current = session.get("settings", {})
    current.update(data)

    session["settings"] = current
    session.permanent = True

    return jsonify({
        "success": True,
        "settings": current
    })


@dashboard_bp.route('/social-accounts', methods=['GET', 'POST', 'PUT', 'PATCH'])
def social_accounts():
    if request.method == 'GET':
        accounts = session.get("social_accounts", [])
        social_accounts_obj = session.get("social_accounts_obj", _default_social_accounts())

        return jsonify({
            "accounts": accounts,
            "socialAccounts": social_accounts_obj,
            "instagram": social_accounts_obj.get("instagram"),
            "facebook": social_accounts_obj.get("facebook"),
            "tiktok": social_accounts_obj.get("tiktok"),
            "linkedin": social_accounts_obj.get("linkedin"),
            "youtube": social_accounts_obj.get("youtube"),
        })

    data = request.get_json(silent=True) or {}
    accounts = session.get("social_accounts", [])
    social_accounts_obj = session.get("social_accounts_obj", _default_social_accounts())

    platform = data.get("platform") or data.get("provider") or data.get("network")

    account = {
        "id": len(accounts) + 1,
        "connected": data.get("connected", True),
        **data
    }

    accounts.append(account)

    if platform:
        social_accounts_obj[platform] = account

    session["social_accounts"] = accounts
    session["social_accounts_obj"] = social_accounts_obj
    session.permanent = True

    return jsonify({
        "success": True,
        "account": account,
        "accounts": accounts,
        "socialAccounts": social_accounts_obj
    }), 201


@dashboard_bp.route('/posts', methods=['GET', 'POST', 'PUT', 'PATCH'])
def posts():
    if request.method == 'GET':
        return jsonify({
            "posts": session.get("posts", [])
        })

    data = request.get_json(silent=True) or {}
    posts_list = session.get("posts", [])

    post = {
        "id": len(posts_list) + 1,
        "status": data.get("status", "draft"),
        **data
    }

    posts_list.append(post)
    session["posts"] = posts_list
    session.permanent = True

    return jsonify({
        "success": True,
        "post": post,
        "posts": posts_list
    }), 201


@dashboard_bp.route('/approvals', methods=['GET', 'POST', 'PUT', 'PATCH'])
def approvals():
    if request.method == 'GET':
        return jsonify({
            "approvals": session.get("approvals", [])
        })

    data = request.get_json(silent=True) or {}
    approvals_list = session.get("approvals", [])

    approval = {
        "id": len(approvals_list) + 1,
        "status": data.get("status", "pending"),
        **data
    }

    approvals_list.append(approval)
    session["approvals"] = approvals_list
    session.permanent = True

    return jsonify({
        "success": True,
        "approval": approval,
        "approvals": approvals_list
    }), 201


@dashboard_bp.route('/schedule', methods=['GET', 'POST', 'PUT', 'PATCH'])
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
        "item": item,
        "schedule": schedule_list
    }), 201


@dashboard_bp.route('/unread', methods=['GET', 'POST', 'PUT', 'PATCH'])
def unread():
    if request.method == 'GET':
        return jsonify({
            "unread": session.get("unread", []),
            "count": len(session.get("unread", []))
        })

    data = request.get_json(silent=True) or {}
    unread_list = session.get("unread", [])

    item = {
        "id": len(unread_list) + 1,
        "read": False,
        **data
    }

    unread_list.append(item)
    session["unread"] = unread_list
    session.permanent = True

    return jsonify({
        "success": True,
        "item": item,
        "unread": unread_list,
        "count": len(unread_list)
    }), 201


@dashboard_bp.route('/alerts', methods=['GET', 'POST', 'PUT', 'PATCH'])
def alerts():
    if request.method == 'GET':
        return jsonify({
            "alerts": session.get("alerts", []),
            "count": len(session.get("alerts", []))
        })

    data = request.get_json(silent=True) or {}
    alerts_list = session.get("alerts", [])

    alert = {
        "id": len(alerts_list) + 1,
        "status": data.get("status", "active"),
        **data
    }

    alerts_list.append(alert)
    session["alerts"] = alerts_list
    session.permanent = True

    return jsonify({
        "success": True,
        "alert": alert,
        "alerts": alerts_list,
        "count": len(alerts_list)
    }), 201
