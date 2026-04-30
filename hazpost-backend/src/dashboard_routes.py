import time
from datetime import datetime
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

    # -------- GET --------
    if request.method == 'GET':
        status_filter = request.args.get("status")
        business_id = request.args.get("businessId")
        slim = request.args.get("slim")

        filtered = posts_list

        # Filtrar por status
        if status_filter:
            statuses = status_filter.split(",")
            filtered = [
                p for p in filtered
                if p.get("status") in statuses
            ]

        # Filtrar por businessId
        if business_id:
            filtered = [
                p for p in filtered
                if str(p.get("businessId")) == str(business_id)
            ]

        # Slim mode
        if slim == "1":
            filtered = [
                {
                    "id": p.get("id"),
                    "status": p.get("status"),
                }
                for p in filtered
            ]

        return jsonify(filtered)

    # -------- DELETE --------
    if request.method == 'DELETE':
        session["posts"] = []
        session.permanent = True
        return jsonify([])

    # -------- CREATE --------
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
    scope = request.args.get("scope")

    if scope == "all":
        return jsonify({
            "niches": [],
            "pending": [],
            "approved": [],
            "rejected": [],
            "extra_niche": []
        })

    return jsonify([])


@dashboard_bp.route('/packages', methods=['GET'])
def packages():
    return jsonify([])


@dashboard_bp.route('/elements', methods=['GET'])
def elements():
    business_id = request.args.get("businessId")

    return jsonify({
        "elements": [],
        "items": [],
        "data": []
    })


@dashboard_bp.route('/music/status', methods=['GET'])
def music_status():
    return jsonify({
        "enabled": False,
        "connected": False,
        "provider": None,
        "status": "inactive"
    })


@dashboard_bp.route('/billing/packages', methods=['GET'])
def billing_packages():
    return jsonify({
        "packages": []
    })


@dashboard_bp.route('/subscriptions/me', methods=['GET'])
def subscriptions_me():
    subscription = session.get("subscription") or {
        "plan": "free",
        "status": "active",
        "creditsRemaining": 40,
        "creditsTotal": 40,
        "periodEnd": None,
    }

    return jsonify(subscription)

# ------------------ BRAND PROFILE (NUEVO) ------------------

def _get_user_store():
    if "user_store" not in session or not isinstance(session.get("user_store"), dict):
        session["user_store"] = {}
    return session["user_store"]


@dashboard_bp.route('/brand-profile', methods=['GET', 'POST', 'PUT'])
def brand_profile():
    store = _get_user_store()

    # -------- GET --------
    if request.method == 'GET':
        profile = store.get("brandProfile") or session.get("brandProfile") or {}
        return jsonify(profile)

    # -------- CREATE / UPDATE --------
    data = request.get_json(silent=True) or {}

    normalized = {
        "companyName": data.get("companyName") or data.get("businessName") or data.get("name"),
        "industry": data.get("industry"),
        "subIndustries": data.get("subIndustries") or data.get("subcategories") or [],
        "description": data.get("description") or data.get("businessDescription"),
        "city": data.get("city") or data.get("location"),
        "audience": data.get("audience") or data.get("targetAudience"),
        "tone": data.get("tone"),
        "website": data.get("website"),
        "logoUrl": data.get("logoUrl"),
    }

    store["brandProfile"] = normalized

    session["brandProfile"] = normalized
    session["user_store"] = store
    session.permanent = True

    return jsonify(normalized)
# ------------------ GENERATE FIRST POST (FIX IA) ------------------

@dashboard_bp.route('/generate-first-post', methods=['POST'])
def generate_first_post():
    profile = session.get("brandProfile") or {}

    company = profile.get("companyName", "tu negocio")
    industry = profile.get("industry", "")
    description = profile.get("description", "")
    city = profile.get("city", "")
    tone = profile.get("tone", "cercano")

    # 🔥 Generación simple (luego conectamos OpenAI)
    caption = f"""
🌞 {company} en {city}

{description}

Impulsa tu negocio en el sector {industry} con soluciones reales.

📩 Escríbenos hoy y empieza a crecer 🚀
""".strip()

    post = {
    "id": int(time.time()),
    "status": "draft",
    "caption": caption,
    "content": caption,
    "text": caption,
    "title": f"Primer post para {company}",
    "industry": industry,
    "businessName": company,
    "city": city,
    "createdAt": datetime.utcnow().isoformat()
}

    posts = session.get("posts", [])
    posts.append(post)

    session["posts"] = posts
    session.permanent = True

    return jsonify(post)
