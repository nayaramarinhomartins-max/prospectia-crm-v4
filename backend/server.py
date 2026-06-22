"""
ProspectIA — Backend API
Roda com: python server.py
Porta: 5000
"""

import asyncio
import logging
import os
import threading
import uuid
from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

from scraper_maps import run_scraper

# ── Config ────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://wyqnqiowxhamvxtzedth.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5cW5xaW93eGhhbXZ4dHplZHRoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMxODIyMSwiZXhwIjoyMDg2ODk0MjIxfQ.UPxsabpDa_FK1jUIhpONzWLfkaaz7bYuKBCQMCWmPV0")
PORT         = int(os.getenv("PORT", 5000))

# ── App ───────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, origins="*")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

# ── Jobs em memória ───────────────────────────────────────
# { job_id: { status, coletado, total, logs, stop_event, iniciado_em } }
jobs: dict = {}


def _atualizar_job(job_id, coletado, nome):
    if job_id not in jobs:
        return
    jobs[job_id]["coletado"] = coletado
    jobs[job_id]["logs"].append(nome)
    if len(jobs[job_id]["logs"]) > 100:
        jobs[job_id]["logs"] = jobs[job_id]["logs"][-100:]


def _rodar_job(job_id, busca, cidade, max_leads, usuario_id):
    stop_event = jobs[job_id]["stop_event"]
    try:
        asyncio.run(run_scraper(
            busca=busca,
            cidade=cidade,
            max_leads=max_leads,
            usuario_id=usuario_id,
            supabase_url=SUPABASE_URL,
            supabase_key=SUPABASE_KEY,
            on_progress=lambda n, nome: _atualizar_job(job_id, n, nome),
            stop_event=stop_event,
        ))
        if not stop_event.is_set():
            jobs[job_id]["status"] = "concluido"
    except Exception as e:
        logging.error(f"Job {job_id} erro: {e}")
        jobs[job_id]["status"] = "erro"
        jobs[job_id]["erro"] = str(e)


# ── Rotas ─────────────────────────────────────────────────

@app.route("/api/health")
def health():
    return jsonify({"ok": True, "ts": datetime.now().isoformat()})


@app.route("/api/captar/iniciar", methods=["POST"])
def iniciar():
    data = request.get_json(force=True)

    busca      = (data.get("nicho") or "").strip()
    cidade     = (data.get("cidade") or "").strip()
    max_leads  = int(data.get("max_leads") or 60)
    usuario_id = data.get("usuario_id") or ""

    if not busca or not cidade:
        return jsonify({"erro": "nicho e cidade são obrigatórios"}), 400

    # Para job anterior do mesmo usuário, se existir
    for jid, j in list(jobs.items()):
        if j.get("usuario_id") == usuario_id and j["status"] == "rodando":
            j["stop_event"].set()
            j["status"] = "parado"

    job_id = str(uuid.uuid4())[:8]
    stop_event = threading.Event()

    jobs[job_id] = {
        "status":      "rodando",
        "coletado":    0,
        "total":       max_leads,
        "logs":        [],
        "stop_event":  stop_event,
        "usuario_id":  usuario_id,
        "busca":       busca,
        "cidade":      cidade,
        "iniciado_em": datetime.now().isoformat(),
        "erro":        None,
    }

    t = threading.Thread(
        target=_rodar_job,
        args=(job_id, busca, cidade, max_leads, usuario_id),
        daemon=True
    )
    t.start()

    return jsonify({"job_id": job_id, "ok": True})


@app.route("/api/captar/status/<job_id>")
def status(job_id):
    j = jobs.get(job_id)
    if not j:
        return jsonify({"erro": "Job não encontrado"}), 404
    return jsonify({
        "status":    j["status"],
        "coletado":  j["coletado"],
        "total":     j["total"],
        "logs":      j["logs"][-10:],
        "erro":      j.get("erro"),
    })


@app.route("/api/captar/parar/<job_id>", methods=["POST"])
def parar(job_id):
    j = jobs.get(job_id)
    if not j:
        return jsonify({"erro": "Job não encontrado"}), 404
    j["stop_event"].set()
    j["status"] = "parado"
    return jsonify({"ok": True})


if __name__ == "__main__":
    print(f"\n ProspectIA Backend rodando em http://localhost:{PORT}\n")
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
