"""
Google Maps Scraper — ProspectIA Backend
Módulo assíncrono chamado pelo server.py
"""

import asyncio
import re
import json
import logging
import random
import urllib.request
import urllib.error
from datetime import datetime
from playwright.async_api import async_playwright

log = logging.getLogger(__name__)

DELAY_SCROLL  = (2, 3)
DELAY_EMPRESA = (3, 5)


async def _pausa(intervalo):
    await asyncio.sleep(random.uniform(*intervalo))


async def _get_text(page, selector):
    try:
        el = await page.query_selector(selector)
        return (await el.inner_text()).strip() if el else ""
    except Exception:
        return ""


async def _get_attr(page, selector, attr):
    try:
        el = await page.query_selector(selector)
        return (await el.get_attribute(attr) or "").strip() if el else ""
    except Exception:
        return ""


async def _safe_text(el):
    try:
        return (await el.inner_text()).strip()
    except Exception:
        return ""


async def _safe_attr(el, attr):
    try:
        return (await el.get_attribute(attr) or "").strip()
    except Exception:
        return ""


def _sb_increment_counter(usuario_id, supabase_url, supabase_key):
    try:
        req = urllib.request.Request(
            f"{supabase_url}/rest/v1/rpc/incrementar_leads_captados",
            data=json.dumps({"p_usuario_id": usuario_id}).encode(),
            method="POST",
            headers={
                "apikey":        supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type":  "application/json",
            }
        )
        with urllib.request.urlopen(req, timeout=5):
            pass
    except Exception:
        pass


def _sb_insert(dados, usuario_id, busca, supabase_url, supabase_key):
    lead = {
        "nome":        dados.get("NOME") or None,
        "empresa":     dados.get("NOME") or None,
        "telefone":    dados.get("TELEFONE") or None,
        "categoria":   dados.get("CATEGORIA") or None,
        "cidade":      dados.get("CIDADE") or None,
        "endereco":    dados.get("ENDERECO") or None,
        "site":        dados.get("SITE") or None,
        "instagram":   dados.get("INSTAGRAM") or None,
        "nota_google": float(dados["NOTA_GOOGLE"].replace(",", ".")) if dados.get("NOTA_GOOGLE") else None,
        "avaliacoes":  int(re.sub(r"\D", "", dados["AVALIACOES_GOOGLE"])) if dados.get("AVALIACOES_GOOGLE") else None,
        "maps_url":    dados.get("MAPS_URL") or None,
        "status_lead": "novo",
        "status_crm":  "Lead",
        "campanha":    busca.lower().replace(' ', '_'),
        "usuario_id":  usuario_id,
    }
    lead = {k: v for k, v in lead.items() if v is not None}
    try:
        body = json.dumps(lead).encode()
        req = urllib.request.Request(
            f"{supabase_url}/rest/v1/MARKETPLACE",
            data=body, method="POST",
            headers={
                "apikey":        supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type":  "application/json",
                "Prefer":        "resolution=ignore-duplicates,return=minimal",
            }
        )
        with urllib.request.urlopen(req, timeout=10):
            pass
        _sb_increment_counter(usuario_id, supabase_url, supabase_key)
        return True
    except urllib.error.HTTPError as e:
        log.warning(f"Supabase {e.code}: {e.read().decode()[:120]}")
        return False
    except Exception as e:
        log.warning(f"Supabase erro: {e}")
        return False


async def _coleta_links(page, max_leads, stop_event):
    urls = []
    urls_vistas = set()
    scrolls = 0
    max_scrolls = max_leads // 5 + 15

    while len(urls) < max_leads and scrolls < max_scrolls:
        if stop_event and stop_event.is_set():
            break

        links = await page.locator("a.hfpxzc").all()
        if not links:
            links = await page.locator("a[href*='/maps/place/']").all()

        for link in links:
            href = await link.get_attribute("href")
            if href and href not in urls_vistas and "/maps/place/" in href:
                urls_vistas.add(href)
                urls.append(href)

        if len(urls) >= max_leads:
            break

        painel = await page.query_selector("div[role='feed']")
        if painel:
            await painel.evaluate("el => el.scrollBy(0, 3000)")
        else:
            await page.mouse.wheel(0, 3000)
        await _pausa(DELAY_SCROLL)
        scrolls += 1

        fim = await page.query_selector("span.HlvSq, span:has-text('Você chegou ao fim')")
        if fim:
            break

    return urls[:max_leads]


async def _extrai_empresa(page, url, cidade, busca):
    COLUNAS = ["NOME", "CATEGORIA", "TELEFONE", "CIDADE", "ENDERECO",
               "SITE", "INSTAGRAM", "NOTA_GOOGLE", "AVALIACOES_GOOGLE",
               "FAIXA_PRECO", "DESCRICAO", "MAPS_URL"]
    dados = {col: "" for col in COLUNAS}
    dados["MAPS_URL"] = url
    dados["CIDADE"]   = cidade

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3500)

        nome_raw = await _get_text(page, "h1.DUwDvf")
        dados["NOME"] = nome_raw.split("|")[0].strip()

        dados["CATEGORIA"] = await _get_text(page, "button.DkEaL") or busca.title()

        nota_aria = await _get_attr(page, "div.F7nice [aria-label]", "aria-label")
        if not nota_aria:
            nota_aria = await _get_attr(page, "span[aria-label*='estrela']", "aria-label")
        if nota_aria:
            m = re.search(r'(\d[,\.]\d)', nota_aria)
            if m:
                dados["NOTA_GOOGLE"] = m.group(1)
            m2 = re.search(r'([\d\.]+)\s*avalia', nota_aria, re.IGNORECASE)
            if m2:
                dados["AVALIACOES_GOOGLE"] = re.sub(r"\D", "", m2.group(1))

        if not dados["NOTA_GOOGLE"]:
            dados["NOTA_GOOGLE"] = await _get_text(page, "span.MW4etd")

        dados["ENDERECO"] = await _get_text(page, "button[data-item-id='address'] .rogA2c")

        tel = await _get_text(page, "button[data-item-id^='phone'] .rogA2c")
        if not tel:
            tel = await _get_text(page, "button[data-tooltip='Copiar número de telefone'] .rogA2c")
        if not tel:
            href = await _get_attr(page, "a[href^='tel:']", "href")
            tel = href.replace("tel:", "")
        dados["TELEFONE"] = re.sub(r"[^\d\+\(\)\-\s]", "", tel).strip()

        site = await _get_attr(page, "a[data-item-id='authority']", "href")
        if not site:
            site = await _get_attr(page, "a[data-tooltip='Abrir site']", "href")
        if site and "google.com" not in site:
            dados["SITE"] = site

        ig_els = await page.query_selector_all("a[href*='instagram.com']")
        for ig in ig_els:
            href = await _safe_attr(ig, "href")
            if href and "instagram.com/p/" not in href:
                dados["INSTAGRAM"] = href
                break

        preco_el = await page.query_selector("span[aria-label*='preço'], span[aria-label*='Nível']")
        if preco_el:
            dados["FAIXA_PRECO"] = await _safe_attr(preco_el, "aria-label")

        desc_el = await page.query_selector(".PYvSYb, div[jslog*='description'] span")
        if desc_el:
            dados["DESCRICAO"] = (await _safe_text(desc_el))[:400]

    except Exception as e:
        log.warning(f"Erro ao extrair empresa: {e}")

    return dados


async def run_scraper(busca, cidade, max_leads, usuario_id, supabase_url, supabase_key,
                      on_progress=None, stop_event=None):
    """
    Roda o scraper do Google Maps.
    on_progress(coletados, nome_empresa) — chamado a cada lead salvo
    stop_event — threading.Event para parar o job
    """
    query = f"{busca} {cidade}"
    log.info(f"Scraper iniciado: '{query}' | max {max_leads}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="pt-BR",
        )
        page = await context.new_page()

        await page.goto("https://www.google.com/maps", wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(2500)

        for sel in ["button:has-text('Aceitar tudo')", "button:has-text('Aceitar')",
                    "button:has-text('Agora não')", "button[aria-label='Fechar']"]:
            try:
                btn = await page.query_selector(sel)
                if btn:
                    await btn.click()
                    await _pausa((1, 2))
                    break
            except Exception:
                pass

        caixa = await page.query_selector("input#searchboxinput, input[name='q']")
        if caixa:
            await caixa.click()
            await caixa.fill(query)
            await page.keyboard.press("Enter")
        else:
            maps_url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"
            await page.goto(maps_url, wait_until="domcontentloaded", timeout=30000)

        await page.wait_for_timeout(5000)

        urls = await _coleta_links(page, max_leads, stop_event)
        log.info(f"Links coletados: {len(urls)}")

        total = 0
        for i, url in enumerate(urls, 1):
            if stop_event and stop_event.is_set():
                log.info("Scraper parado pelo usuário.")
                break

            dados = await _extrai_empresa(page, url, cidade, busca)

            if dados["NOME"]:
                ok = _sb_insert(dados, usuario_id, busca, supabase_url, supabase_key)
                if ok:
                    total += 1
                    log.info(f"[{total}] {dados['NOME']} | {dados['TELEFONE'] or '-'}")
                    if on_progress:
                        on_progress(total, dados["NOME"])

            await _pausa(DELAY_EMPRESA)

        await browser.close()

    log.info(f"Scraper concluído: {total} leads")
    return total
