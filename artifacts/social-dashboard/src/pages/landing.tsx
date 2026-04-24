import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { PricingSection } from "@/components/PricingSection";
import { SeoMeta } from "@/hooks/useSeoMeta";
import { BRAND } from "@/config/brand";

const DARK = "#0A0A0F";
const DARK_2 = "#12121A";
const DARK_3 = "#1C1C28";
const TEXT = "#E8E8F0";
const MUTED = "#8888A8";
const ACCENT = BRAND.primary || "#00C2FF";
const ACCENT_HOVER = "#22D4FF";

function buildCss(accent: string) {
  return `
  .hz-root *, .hz-root *::before, .hz-root *::after,
  .hz-nav *, .hz-nav *::before, .hz-nav *::after,
  .hz-footer *, .hz-footer *::before, .hz-footer *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .hz-root {
    font-family: 'Poppins', sans-serif;
    background: ${DARK};
    color: ${TEXT};
    line-height: 1.6;
    overflow-x: hidden;
    min-height: 100vh;
  }

  .hz-root a { text-decoration: none; }

  .hz-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 40px;
    backdrop-filter: blur(20px);
    background: rgba(10,10,15,0.85);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }

  .hz-logo { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.5px; text-decoration: none; }
  .hz-logo .w { color: #fff; }
  .hz-logo .c { color: ${accent}; }

  .hz-nav-links { display: flex; gap: 32px; list-style: none; }
  .hz-nav-links a { color: ${MUTED}; font-size: 0.9rem; font-weight: 500; transition: color 0.2s; }
  .hz-nav-links a:hover { color: #fff; }

  .hz-nav-cta { display: flex; gap: 12px; align-items: center; }

  .hz-btn-outline {
    padding: 10px 20px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 50px;
    color: ${TEXT};
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    font-family: 'Poppins',sans-serif;
    background: transparent;
    transition: all 0.2s;
    text-decoration: none;
  }

  .hz-btn-outline:hover {
    border-color: ${accent};
    color: ${accent};
  }

  .hz-btn-primary {
    padding: 10px 24px;
    background: ${accent};
    border: none;
    border-radius: 50px;
    color: #000;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    font-family: 'Poppins',sans-serif;
    transition: all 0.2s;
    box-shadow: 0 0 20px rgba(0,194,255,0.3);
    text-decoration: none;
    display: inline-block;
  }

  .hz-btn-primary:hover {
    background: ${ACCENT_HOVER};
    transform: translateY(-1px);
    box-shadow: 0 0 30px rgba(0,194,255,0.4);
  }

  .hz-hero {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 120px 24px 80px;
    overflow: hidden;
  }

  .hz-hero-glow {
    position: absolute;
    top: -20%;
    left: 50%;
    transform: translateX(-50%);
    width: 800px;
    height: 600px;
    background: radial-gradient(ellipse, rgba(0,194,255,0.18) 0%, transparent 70%);
    pointer-events: none;
  }

  .hz-hero-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(0,194,255,0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,194,255,0.05) 1px, transparent 1px);
    background-size: 60px 60px;
    mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent);
    pointer-events: none;
  }

  .hz-hero-content {
    position: relative;
    z-index: 1;
    max-width: 860px;
  }

  .hz-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    background: rgba(0,194,255,0.12);
    border: 1px solid rgba(0,194,255,0.3);
    border-radius: 50px;
    font-size: 0.8rem;
    font-weight: 600;
    color: ${accent};
    margin-bottom: 28px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .hz-hero h1 {
    font-size: clamp(2.5rem, 7vw, 5.5rem);
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: -2px;
    color: #fff;
    margin-bottom: 24px;
  }

  .hz-hero h1 .hl { color: ${accent}; }

  .hz-hero p {
    font-size: clamp(1rem, 2vw, 1.25rem);
    color: ${MUTED};
    max-width: 600px;
    margin: 0 auto 40px;
  }

  .hz-hero-ctas {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 56px;
  }

  .hz-hero-ctas .hz-btn-primary {
    padding: 16px 36px;
    font-size: 1rem;
  }

  .hz-hero-ctas .hz-btn-outline {
    padding: 16px 28px;
    font-size: 1rem;
  }

  .hz-proof {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .hz-avatars { display: flex; }

  .hz-avatars span {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid ${DARK};
    margin-left: -10px;
    background: linear-gradient(135deg, ${accent}, #7B2FFF);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
    color: white;
  }

  .hz-avatars span:first-child { margin-left: 0; }

  .hz-stars {
    color: #FFB800;
    letter-spacing: 2px;
  }

  .hz-proof-text {
    font-size: 0.85rem;
    color: ${MUTED};
  }

  .hz-logos {
    padding: 40px 24px;
    border-top: 1px solid rgba(255,255,255,0.08);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    text-align: center;
    background: ${DARK_2};
  }

  .hz-logos p {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: ${MUTED};
    margin-bottom: 24px;
  }

  .hz-logos-list {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .hz-pill {
    padding: 8px 20px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 50px;
    font-size: 0.85rem;
    font-weight: 600;
    color: ${MUTED};
    background: rgba(255,255,255,0.04);
  }

  .hz-split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    align-items: stretch;
    margin-top: 52px;
  }

  .hz-panel {
    padding: 36px;
    border-radius: 20px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    position: relative;
    overflow: hidden;
  }

  .hz-panel.bad {
    background: rgba(255,82,82,0.05);
    border-color: rgba(255,82,82,0.16);
  }

  .hz-panel.good {
    background: rgba(0,194,255,0.06);
    border-color: rgba(0,194,255,0.22);
  }

  .hz-panel h3 {
    font-size: 1.35rem;
    color: #fff;
    font-weight: 800;
    margin-bottom: 18px;
    letter-spacing: -0.4px;
  }

  .hz-list {
    list-style: none;
    display: grid;
    gap: 12px;
  }

  .hz-list li {
    color: ${TEXT};
    font-size: 0.95rem;
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .hz-list span { flex-shrink: 0; }

  .hz-result-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
    margin-top: 48px;
  }

  .hz-result-card {
    padding: 28px 22px;
    border-radius: 18px;
    background: ${DARK_2};
    border: 1px solid rgba(255,255,255,0.08);
    text-align: center;
  }

  .hz-result-card strong {
    display: block;
    font-size: 2rem;
    color: ${accent};
    font-weight: 900;
    letter-spacing: -1px;
    margin-bottom: 8px;
  }

  .hz-result-card p {
    color: ${MUTED};
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .hz-demo-box {
    margin-top: 50px;
    border-radius: 24px;
    border: 1px solid rgba(0,194,255,0.18);
    background: linear-gradient(135deg, rgba(0,194,255,0.08), rgba(123,47,255,0.08));
    padding: 32px;
    display: grid;
    grid-template-columns: 1.05fr 0.95fr;
    gap: 28px;
    align-items: center;
  }

  .hz-demo-screen {
    border-radius: 18px;
    background: ${DARK};
    border: 1px solid rgba(255,255,255,0.10);
    padding: 22px;
    box-shadow: 0 20px 80px rgba(0,0,0,0.28);
  }

  .hz-demo-top {
    display: flex;
    gap: 8px;
    margin-bottom: 18px;
  }

  .hz-demo-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(255,255,255,0.22);
  }

  .hz-demo-post {
    border-radius: 16px;
    padding: 18px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    margin-bottom: 12px;
  }

  .hz-demo-post h4 {
    color: #fff;
    font-size: 0.95rem;
    margin-bottom: 8px;
  }

  .hz-demo-post p {
    color: ${MUTED};
    font-size: 0.82rem;
    line-height: 1.55;
  }

  .hz-demo-meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 14px;
  }

  .hz-demo-meta span {
    font-size: 0.72rem;
    color: ${accent};
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(0,194,255,0.10);
    border: 1px solid rgba(0,194,255,0.22);
  }

  .hz-urgency {
    margin-top: 28px;
    padding: 18px 22px;
    border-radius: 18px;
    background: rgba(255,184,0,0.08);
    border: 1px solid rgba(255,184,0,0.22);
    color: #FFD36A;
    font-size: 0.92rem;
    font-weight: 650;
    text-align: center;
  }

  .hz-microproof {
    margin-top: 14px;
    color: ${MUTED};
    font-size: 0.82rem;
    text-align: center;
  }

  .hz-section {
    padding: 100px 24px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .hz-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 3px;
    color: ${accent};
    font-weight: 700;
    margin-bottom: 12px;
  }

  .hz-title {
    font-size: clamp(1.8rem, 4vw, 3rem);
    font-weight: 800;
    color: #fff;
    letter-spacing: -1px;
    margin-bottom: 16px;
    line-height: 1.15;
  }

  .hz-sub {
    font-size: 1rem;
    color: ${MUTED};
    max-width: 540px;
    line-height: 1.7;
  }

  .hz-steps-wrap {
    background: ${DARK_2};
    padding: 80px 24px;
  }

  .hz-steps {
    max-width: 1200px;
    margin: 0 auto;
  }

  .hz-steps-head {
    text-align: center;
    margin-bottom: 64px;
  }

  .hz-steps-head .hz-sub { margin: 0 auto; }

  .hz-steps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 2px;
  }

  .hz-step {
    padding: 40px 32px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    transition: background 0.3s;
  }

  .hz-step:first-child { border-radius: 16px 0 0 16px; }
  .hz-step:last-child { border-radius: 0 16px 16px 0; }
  .hz-step:hover { background: rgba(0,194,255,0.05); }

  .hz-step-num {
    font-size: 3rem;
    font-weight: 900;
    color: rgba(0,194,255,0.15);
    line-height: 1;
    margin-bottom: 16px;
    letter-spacing: -3px;
  }

  .hz-step-icon {
    font-size: 2rem;
    margin-bottom: 16px;
    display: block;
  }

  .hz-step h3 {
    font-size: 1.1rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 10px;
  }

  .hz-step p {
    font-size: 0.875rem;
    color: ${MUTED};
    line-height: 1.6;
  }

  .hz-features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    overflow: hidden;
    margin-top: 56px;
  }

  .hz-feature {
    padding: 40px 32px;
    background: ${DARK};
    transition: background 0.3s;
  }

  .hz-feature:hover { background: ${DARK_3}; }

  .hz-ficon {
    width: 52px;
    height: 52px;
    background: rgba(0,194,255,0.1);
    border: 1px solid rgba(0,194,255,0.2);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    margin-bottom: 20px;
  }

  .hz-feature h3 {
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 10px;
  }

  .hz-feature p {
    font-size: 0.85rem;
    color: ${MUTED};
    line-height: 1.6;
  }

  .hz-plat-wrap {
    background: ${DARK_2};
    padding: 80px 24px;
  }

  .hz-plat {
    max-width: 1200px;
    margin: 0 auto;
  }

  .hz-plat-head {
    text-align: center;
    margin-bottom: 56px;
  }

  .hz-plat-head .hz-sub { margin: 0 auto; }

  .hz-plat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }

  .hz-pcard {
    padding: 40px 32px;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    text-align: center;
    transition: all 0.3s;
    position: relative;
    overflow: hidden;
  }

  .hz-pcard:hover { transform: translateY(-4px); }

  .hz-pcard-emoji {
    font-size: 3rem;
    margin-bottom: 16px;
    display: block;
  }

  .hz-pcard h3 {
    font-size: 1.3rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 8px;
  }

  .hz-pcard p {
    font-size: 0.85rem;
    color: ${MUTED};
  }

  .hz-pbadge {
    display: inline-block;
    margin-top: 16px;
    padding: 4px 12px;
    background: rgba(0,194,255,0.1);
    border: 1px solid rgba(0,194,255,0.3);
    border-radius: 50px;
    font-size: 0.72rem;
    font-weight: 600;
    color: ${accent};
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .hz-toggle-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin: 28px 0 0;
  }

  .hz-toggle-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: ${MUTED};
    cursor: pointer;
    transition: color 0.2s;
  }

  .hz-toggle-label.active { color: #fff; }

  .hz-toggle-switch {
    position: relative;
    width: 48px;
    height: 26px;
    border-radius: 13px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.15);
    cursor: pointer;
    transition: background 0.2s;
    flex-shrink: 0;
  }

  .hz-toggle-switch.on {
    background: ${accent};
    border-color: ${accent};
  }

  .hz-toggle-knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }

  .hz-toggle-switch.on .hz-toggle-knob { transform: translateX(22px); }

  .hz-toggle-badge {
    padding: 3px 10px;
    background: rgba(0,194,255,0.15);
    border: 1px solid rgba(0,194,255,0.3);
    border-radius: 50px;
    font-size: 0.7rem;
    font-weight: 700;
    color: ${accent};
    letter-spacing: 0.5px;
  }

  .hz-pricing-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
    margin-top: 32px;
  }

  .hz-pcard2 {
    padding: 40px 32px;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.08);
    background: ${DARK_2};
    position: relative;
    transition: all 0.3s;
    display: block;
    text-decoration: none;
    color: inherit;
    cursor: pointer;
  }

  .hz-pcard2:hover { transform: translateY(-4px); }

  .hz-pcard2.pop {
    border-color: ${accent};
    background: ${DARK_3};
    box-shadow: 0 0 40px rgba(0,194,255,0.12);
  }

  .hz-popular {
    position: absolute;
    top: -14px;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 20px;
    background: ${accent};
    color: #000;
    font-size: 0.72rem;
    font-weight: 700;
    border-radius: 50px;
    text-transform: uppercase;
    letter-spacing: 1px;
    white-space: nowrap;
  }

  .hz-plan-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: ${MUTED};
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 8px;
  }

  .hz-plan-price { margin-bottom: 8px; }

  .hz-plan-price strong {
    font-size: 2.8rem;
    font-weight: 900;
    color: #fff;
    letter-spacing: -2px;
  }

  .hz-plan-price span {
    font-size: 0.85rem;
    color: ${MUTED};
  }

  .hz-plan-desc {
    font-size: 0.85rem;
    color: ${MUTED};
    margin-bottom: 28px;
  }

  .hz-plan-feats {
    list-style: none;
    margin-bottom: 32px;
  }

  .hz-plan-feats li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 0.85rem;
    color: ${TEXT};
    padding: 7px 0;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }

  .hz-plan-feats li:last-child { border-bottom: none; }

  .hz-check {
    color: ${accent};
    font-weight: 700;
    flex-shrink: 0;
  }

  .hz-plan-btn {
    display: block;
    width: 100%;
    padding: 14px;
    border-radius: 50px;
    font-family: 'Poppins',sans-serif;
    font-weight: 700;
    font-size: 0.9rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
  }

  .hz-plan-ghost {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.08);
    color: ${TEXT};
  }

  .hz-plan-ghost:hover {
    border-color: ${accent};
    color: ${accent};
  }

  .hz-plan-solid {
    background: ${accent};
    border: none;
    color: #000;
    box-shadow: 0 0 20px rgba(0,194,255,0.3);
  }

  .hz-plan-solid:hover {
    background: ${ACCENT_HOVER};
    transform: translateY(-1px);
  }

  .hz-testi-wrap {
    background: ${DARK_2};
    padding: 80px 24px;
  }

  .hz-testi {
    max-width: 1200px;
    margin: 0 auto;
  }

  .hz-testi-head {
    text-align: center;
    margin-bottom: 56px;
  }

  .hz-testi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 24px;
  }

  .hz-tcard {
    padding: 32px;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.08);
    background: ${DARK};
  }

  .hz-tcard-stars {
    color: #FFB800;
    margin-bottom: 16px;
    letter-spacing: 2px;
  }

  .hz-tcard-text {
    font-size: 0.9rem;
    color: ${TEXT};
    line-height: 1.7;
    margin-bottom: 20px;
    font-style: italic;
  }

  .hz-tcard-author {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .hz-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, ${accent}, #7B2FFF);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.85rem;
    color: white;
    flex-shrink: 0;
  }

  .hz-author-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: #fff;
  }

  .hz-author-role {
    font-size: 0.75rem;
    color: ${MUTED};
  }

  .hz-faq-list {
    margin-top: 48px;
    max-width: 720px;
  }

  .hz-faq-item {
    border-bottom: 1px solid rgba(255,255,255,0.08);
    padding: 20px 0;
  }

  .hz-faq-q {
    font-weight: 600;
    color: #fff;
    font-size: 0.95rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .hz-faq-q::after {
    content: '+';
    color: ${accent};
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .hz-faq-a {
    font-size: 0.875rem;
    color: ${MUTED};
    line-height: 1.7;
    margin-top: 12px;
  }

  .hz-cta-wrap {
    padding: 80px 24px;
    background: linear-gradient(180deg, transparent, ${DARK_2} 50%, transparent);
    text-align: center;
  }

  .hz-cta-box {
    max-width: 700px;
    margin: 0 auto;
    padding: 72px 40px;
    background: ${DARK_3};
    border: 1px solid rgba(0,194,255,0.25);
    border-radius: 24px;
    box-shadow: 0 0 80px rgba(0,194,255,0.08), inset 0 0 60px rgba(0,194,255,0.03);
    position: relative;
  }

  .hz-cta-box::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, ${accent}, transparent);
  }

  .hz-cta-box h2 {
    font-size: clamp(1.8rem, 4vw, 2.8rem);
    font-weight: 900;
    color: #fff;
    letter-spacing: -1px;
    margin-bottom: 16px;
  }

  .hz-cta-box p {
    font-size: 1rem;
    color: ${MUTED};
    margin-bottom: 36px;
  }

  .hz-cta-box .hz-btn-primary {
    padding: 18px 48px;
    font-size: 1.05rem;
  }

  .hz-nocc {
    font-size: 0.78rem;
    color: ${MUTED};
    margin-top: 16px;
  }

  .hz-footer {
    border-top: 1px solid rgba(255,255,255,0.08);
    padding: 48px 24px 32px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .hz-footer-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 32px;
    margin-bottom: 40px;
  }

  .hz-footer-brand p {
    font-size: 0.85rem;
    color: ${MUTED};
    margin-top: 8px;
    max-width: 240px;
    line-height: 1.6;
  }

  .hz-flinks h4 {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: ${MUTED};
    margin-bottom: 12px;
  }

  .hz-flinks ul { list-style: none; }

  .hz-flinks ul li { margin-bottom: 8px; }

  .hz-flinks ul a {
    font-size: 0.85rem;
    color: ${MUTED};
    transition: color 0.2s;
    text-decoration: none;
  }

  .hz-flinks ul a:hover { color: #fff; }

  .hz-footer-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    padding-top: 24px;
    border-top: 1px solid rgba(255,255,255,0.08);
  }

  .hz-footer-bottom p {
    font-size: 0.78rem;
    color: ${MUTED};
  }

  @media (max-width: 768px) {
    .hz-nav { padding: 14px 20px; }
    .hz-nav-links { display: none; }
    .hz-split, .hz-demo-box { grid-template-columns: 1fr; }
    .hz-result-grid { grid-template-columns: repeat(2, 1fr); }
    .hz-plat-grid { grid-template-columns: 1fr; }
    .hz-step:first-child { border-radius: 16px 16px 0 0; }
    .hz-step:last-child { border-radius: 0 0 16px 16px; }
    .hz-steps-grid { grid-template-columns: 1fr; gap: 0; }
    .hz-footer-top { flex-direction: column; }
    .hz-cta-box { padding: 48px 24px; }
  }
`;
}

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) return null;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "¿Qué es HazPost y para qué sirve?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "HazPost es una plataforma SaaS que usa Inteligencia Artificial para crear, programar y publicar contenido en Instagram, TikTok y Facebook de forma automática. Diseñada para empresas, emprendedores y agencias de todo el mundo."
        }
      },
      {
        "@type": "Question",
        "name": "¿Necesito conocimientos de diseño o marketing?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. Solo necesitás describir tu negocio una vez. La IA genera las imágenes, los textos y los hashtags adaptados a tu marca."
        }
      },
      {
        "@type": "Question",
        "name": "¿Funciona con Instagram de empresa y TikTok Business?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Sí. HazPost usa las APIs oficiales de Meta (Instagram Business) y TikTok Business. La conexión es segura vía OAuth."
        }
      },
      {
        "@type": "Question",
        "name": "¿Cómo pago? ¿Qué métodos de pago aceptan?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Aceptamos tarjetas de crédito y débito internacionales. Para usuarios en Colombia, también aceptamos pagos en pesos colombianos (COP) con PSE a través de Wompi."
        }
      },
      {
        "@type": "Question",
        "name": "¿Puedo cancelar en cualquier momento?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Sí, podés cancelar tu suscripción cuando quieras desde la configuración de tu cuenta. No hay contratos ni cargos ocultos. Los 30 días de prueba son completamente gratis."
        }
      },
      {
        "@type": "Question",
        "name": "¿Puedo manejar múltiples negocios o clientes?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Sí. Los planes Negocio y Agencia permiten gestionar múltiples clientes desde una sola cuenta. Ideal para agencias de marketing digital o usuarios que tengan varios negocios."
        }
      }
    ],
  };

  return (
    <>
      <SeoMeta
        title="HazPost — Publica todos los días sin hacerlo tú"
        description="HazPost crea, diseña y publica contenido por ti en Instagram, TikTok y Facebook. Ahorra horas cada semana y consigue más clientes con redes activas."
        canonical="https://hazpost.app/"
        ogTitle="HazPost — Publica contenido todos los días sin hacerlo tú"
        ogDescription="HazPost crea, diseña y publica contenido automáticamente para que tu negocio nunca se quede quieto en redes."
        ogUrl="https://hazpost.app/"
        ogImage="https://hazpost.app/opengraph.jpg"
        jsonLd={faqJsonLd}
      />

      <style>{buildCss(ACCENT)}</style>

      <nav className="hz-nav" aria-label="Navegación principal">
        <a href="/" className="hz-logo">
          <span className="w">haz</span>
          <span className="c">post</span>
        </a>

        <ul className="hz-nav-links">
          <li><a href="#como-funciona">Cómo funciona</a></li>
          <li><a href="#funciones">Funciones</a></li>
          <li><a href="#precios">Precios</a></li>
          <li><a href="#faq">FAQ</a></li>
        </ul>

        <div className="hz-nav-cta">
          <a href="/login" className="hz-btn-outline">Iniciar sesión</a>
          <a href="/register" className="hz-btn-primary">Probar gratis</a>
        </div>
      </nav>

      <main id="contenido-principal">
        <div className="hz-root">
          <header className="hz-hero" aria-label="Publicá en redes con IA">
            <div className="hz-hero-glow" />
            <div className="hz-hero-grid" />

            <div className="hz-hero-content">
              <div className="hz-badge">🔥 Oferta de lanzamiento · primeros negocios</div>

              <h1>
                Publica contenido <span className="hl">todos los días</span>
                <br />
                sin hacerlo tú
              </h1>

              <p>
                HazPost crea, diseña y publica contenido por ti en Instagram, TikTok y
                Facebook. Tú solo revisas, apruebas y sigues atendiendo clientes.
              </p>

              <div className="hz-hero-ctas">
                <a href="/register" className="hz-btn-primary">Automatizar mi negocio</a>
                <a href="#demo-real" className="hz-btn-outline">Ver cómo funciona →</a>
              </div>

              <div className="hz-proof">
                <div className="hz-avatars">
                  <span>LP</span>
                  <span>MC</span>
                  <span>JR</span>
                  <span>AS</span>
                  <span>+</span>
                </div>

                <div>
                  <div className="hz-stars">★★★★★</div>
                  <div className="hz-proof-text">
                    Sin experiencia · Ahorra horas cada semana · Publica automáticamente
                  </div>
                </div>
              </div>
            </div>
          </header>

          <section className="hz-logos" aria-label="Plataformas compatibles">
            <p>Funciona con tus redes favoritas</p>

            <div className="hz-logos-list">
              <div className="hz-pill">📸 Instagram Business</div>
              <div className="hz-pill">🎵 TikTok Business</div>
              <div className="hz-pill">📘 Facebook Pages</div>
              <div className="hz-pill">🤖 GPT-5</div>
              <div className="hz-pill">🇨🇴 Pagos en COP</div>
            </div>
          </section>

          <section className="hz-section" aria-label="El problema que resuelve HazPost">
            <div className="hz-label">El problema</div>

            <h2 className="hz-title">
              Tu negocio pierde clientes cuando{" "}
              <span style={{ color: ACCENT }}>deja de publicar.</span>
            </h2>

            <p className="hz-sub">
              La mayoría de negocios sabe que debe estar activo en redes, pero no tiene
              tiempo, ideas ni constancia para hacerlo bien.
            </p>

            <div className="hz-split">
              <div className="hz-panel bad">
                <h3>Sin HazPost</h3>
                <ul className="hz-list">
                  <li><span>❌</span> Publicas cuando te acuerdas.</li>
                  <li><span>❌</span> Pierdes horas pensando qué decir.</li>
                  <li><span>❌</span> Dependencia de diseñador o community manager.</li>
                  <li><span>❌</span> Redes abandonadas justo cuando el cliente te busca.</li>
                </ul>
              </div>

              <div className="hz-panel good">
                <h3>Con HazPost</h3>
                <ul className="hz-list">
                  <li><span>✅</span> Contenido listo todos los días.</li>
                  <li><span>✅</span> Imágenes, captions y hashtags en minutos.</li>
                  <li><span>✅</span> Calendario automático para Instagram, TikTok y Facebook.</li>
                  <li><span>✅</span> Más visibilidad sin contratar equipo adicional.</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="hz-steps-wrap" id="como-funciona" aria-label="Cómo funciona HazPost">
            <div className="hz-steps" id="demo-real">
              <div className="hz-steps-head">
                <div className="hz-label">Cómo funciona</div>

                <h2 className="hz-title">
                  De negocio quieto a redes activas{" "}
                  <span style={{ color: ACCENT }}>en minutos.</span>
                </h2>

                <p className="hz-sub">
                  HazPost convierte la información de tu negocio en publicaciones listas para
                  vender, educar y mantenerte presente.
                </p>
              </div>

              <div className="hz-steps-grid">
                {[
                  {
                    n: "01",
                    icon: "🏢",
                    t: "Conecta tu negocio",
                    d: "Cuéntale qué vendes, a quién le vendes y cómo habla tu marca.",
                  },
                  {
                    n: "02",
                    icon: "🤖",
                    t: "La IA crea contenido",
                    d: "Genera ideas, diseños, captions y hashtags listos para publicar.",
                  },
                  {
                    n: "03",
                    icon: "✅",
                    t: "Apruebas en segundos",
                    d: "Revisa, edita o aprueba el contenido antes de que se publique.",
                  },
                  {
                    n: "04",
                    icon: "🚀",
                    t: "Publica y aprende",
                    d: "Publica automáticamente y mejora con los resultados de tus redes.",
                  },
                ].map((s) => (
                  <div key={s.n} className="hz-step">
                    <div className="hz-step-num">{s.n}</div>
                    <span className="hz-step-icon">{s.icon}</span>
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="hz-section" aria-label="Demo visual de HazPost">
            <div className="hz-label">Demo real</div>

            <h2 className="hz-title">
              Así se ve tener un asistente de contenido{" "}
              <span style={{ color: ACCENT }}>trabajando por ti.</span>
            </h2>

            <p className="hz-sub">
              El objetivo no es solo crear posts: es mantener tu negocio activo, organizado
              y vendiendo en redes sin que tú pierdas horas cada semana.
            </p>

            <div className="hz-demo-box">
              <div className="hz-demo-screen" aria-label="Mockup del dashboard HazPost">
                <div className="hz-demo-top">
                  <span className="hz-demo-dot" />
                  <span className="hz-demo-dot" />
                  <span className="hz-demo-dot" />
                </div>

                <div className="hz-demo-post">
                  <h4>📅 Calendario de contenido</h4>
                  <p>
                    Lunes: Reel educativo · Miércoles: Promoción · Viernes: Testimonio ·
                    Domingo: Historia.
                  </p>
                  <div className="hz-demo-meta">
                    <span>Auto programado</span>
                    <span>Mejor horario</span>
                  </div>
                </div>

                <div className="hz-demo-post">
                  <h4>🤖 Post generado por IA</h4>
                  <p>
                    “¿Sabías que puedes ahorrar tiempo y publicar mejor? Hoy te mostramos
                    cómo elegir el servicio ideal para tu negocio...”
                  </p>
                  <div className="hz-demo-meta">
                    <span>Caption listo</span>
                    <span>Hashtags</span>
                    <span>Imagen</span>
                  </div>
                </div>

                <div className="hz-demo-post" style={{ marginBottom: 0 }}>
                  <h4>✅ Pendiente de aprobación</h4>
                  <p>
                    Edita, aprueba o publica. Tú mantienes el control, HazPost hace el
                    trabajo pesado.
                  </p>
                  <div className="hz-demo-meta">
                    <span>5 segundos</span>
                    <span>Listo para publicar</span>
                  </div>
                </div>
              </div>

              <div>
                <h3
                  style={{
                    fontSize: "1.5rem",
                    color: "#fff",
                    marginBottom: "16px",
                    fontWeight: 800,
                  }}
                >
                  Deja de improvisar contenido.
                </h3>

                <ul className="hz-list">
                  <li><span>⚡</span> Crea publicaciones en segundos.</li>
                  <li><span>⏱️</span> Ahorra 10+ horas a la semana.</li>
                  <li><span>📈</span> Mantén tus redes activas para atraer más clientes potenciales.</li>
                  <li><span>🚀</span> Publica incluso cuando estás ocupado atendiendo tu negocio.</li>
                </ul>

                <div className="hz-urgency">
                  ⏳ Oferta por tiempo limitado — precios pueden cambiar
                </div>
              </div>
            </div>
          </section>

          <section className="hz-section" id="funciones" aria-label="Funciones de HazPost">
            <div className="hz-label">Solución completa</div>

            <h2 className="hz-title">
              Contenido, diseño, calendario y publicación
              <br />
              <span style={{ color: ACCENT }}>en un solo lugar</span>
            </h2>

            <p className="hz-sub">
              HazPost reemplaza el caos de ideas sueltas, diseños manuales y publicaciones
              olvidadas por un sistema simple para mantener tu negocio visible.
            </p>

            <div className="hz-features-grid">
              {[
                {
                  i: "✍️",
                  t: "Generación de contenido con IA",
                  d: "Captions, imágenes y hashtags adaptados al tono de tu marca en segundos.",
                },
                {
                  i: "📅",
                  t: "Calendario editorial visual",
                  d: "Visualizá y reorganizá tu contenido semana a semana. Arrastrá y soltá para reprogramar.",
                },
                {
                  i: "⚡",
                  t: "Generador masivo",
                  d: "Creá 30 posts de un mes entero en minutos. Ideal para campañas y fechas especiales.",
                },
                {
                  i: "✅",
                  t: "Flujo de aprobación",
                  d: "Tu equipo revisa y aprueba antes de publicar. Control total sin perder velocidad.",
                },
                {
                  i: "📊",
                  t: "Estadísticas reales",
                  d: "Alcance, impresiones, engagement y mejores horarios directamente desde Meta y TikTok.",
                },
                {
                  i: "🎨",
                  t: "Biblioteca de fondos",
                  d: "Catálogo propio de fondos y overlays de marca para mantener coherencia visual siempre.",
                },
                {
                  i: "🔄",
                  t: "Publicación automática",
                  d: "Publica en el horario óptimo sin intervención humana. Funciona 24/7 incluso cuando dormís.",
                },
                {
                  i: "💬",
                  t: "Compartir por WhatsApp",
                  d: "Enviá previsualizaciones del contenido a clientes por WhatsApp con un click.",
                },
                {
                  i: "🏢",
                  t: "Multi-negocio",
                  d: "Gestioná múltiples marcas o clientes desde una sola cuenta. Perfecto para agencias.",
                },
              ].map((f) => (
                <div key={f.t} className="hz-feature">
                  <div className="hz-ficon">{f.i}</div>
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="hz-plat-wrap" aria-label="Plataformas de publicación">
            <div className="hz-plat">
              <div className="hz-plat-head">
                <div className="hz-label">Plataformas</div>

                <h2 className="hz-title">
                  Una app, <span style={{ color: ACCENT }}>todas tus redes</span>
                </h2>

                <p className="hz-sub">
                  Conectá tus cuentas una sola vez y publicá en todas desde HazPost.
                </p>
              </div>

              <div className="hz-plat-grid">
                {[
                  {
                    cls: "ig",
                    e: "📸",
                    t: "Instagram",
                    d: "Posts de feed, reels y stories. Captions con emojis y hashtags optimizados para el algoritmo.",
                  },
                  {
                    cls: "tt",
                    e: "🎵",
                    t: "TikTok",
                    d: "Videos cortos y contenido viral. La IA adapta el tono para la audiencia joven de TikTok.",
                  },
                  {
                    cls: "fb",
                    e: "📘",
                    t: "Facebook",
                    d: "Posts en página de empresa con imágenes y texto. Ideal para comunidades y negocios locales.",
                  },
                ].map((p) => (
                  <div key={p.t} className="hz-pcard">
                    <span className="hz-pcard-emoji">{p.e}</span>
                    <h3>{p.t}</h3>
                    <p>{p.d}</p>
                    <span className="hz-pbadge">✓ Publicación automática</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="hz-section" aria-label="Resultados de usar HazPost">
            <div className="hz-label">Resultados</div>

            <h2 className="hz-title">
              Lo que cambia cuando{" "}
              <span style={{ color: ACCENT }}>dejas de hacerlo todo manual.</span>
            </h2>

            <p className="hz-sub">
              HazPost está pensado para negocios que necesitan constancia, velocidad y una
              presencia profesional sin contratar un equipo completo.
            </p>

            <div className="hz-result-grid">
              <div className="hz-result-card">
                <strong>30+</strong>
                <p>posts al mes listos para revisar y publicar.</p>
              </div>

              <div className="hz-result-card">
                <strong>10h+</strong>
                <p>ahorradas cada semana en ideas, textos y diseño.</p>
              </div>

              <div className="hz-result-card">
                <strong>24/7</strong>
                <p>contenido programado incluso cuando estás ocupado.</p>
              </div>

              <div className="hz-result-card">
                <strong>1</strong>
                <p>lugar para crear, aprobar y publicar.</p>
              </div>
            </div>
          </section>
        </div>

        <div
          style={{
            background: DARK,
            color: TEXT,
            fontFamily: "'Poppins',sans-serif",
            overflowX: "hidden",
          }}
        >
          <section
            id="precios"
            aria-label="Planes y precios"
            style={{
              maxWidth: "1200px",
              margin: "0 auto",
              padding: "100px 24px 80px",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <div className="hz-label">Precios</div>

              <h2 className="hz-title">
                Menos que un community manager.
                <br />
                <span style={{ color: ACCENT }}>Más constancia para vender en redes.</span>
              </h2>

              <p className="hz-sub" style={{ margin: "0 auto" }}>
                Empieza gratis, valida el valor y activa el plan cuando tu negocio esté
                listo para publicar en serio.
              </p>

              <div
                className="hz-urgency"
                style={{ maxWidth: "640px", margin: "24px auto 0" }}
              >
                🔥 Precios de lanzamiento para los primeros negocios · pueden cambiar en
                cualquier momento
              </div>
            </div>

            <PricingSection mode="landing" />
          </section>
        </div>

        <div className="hz-root" style={{ minHeight: 0 }}>
          <section className="hz-testi-wrap" aria-label="Testimonios de clientes">
            <div className="hz-testi">
              <div className="hz-testi-head">
                <div className="hz-label">Prueba social</div>

                <h2 className="hz-title">
                  Negocios reales ya están probando
                  <br />
                  <span style={{ color: ACCENT }}>contenido automático.</span>
                </h2>
              </div>

              <div className="hz-testi-grid">
                {[
                  {
                    init: "LP",
                    name: "Negocio local",
                    role: "Prueba real HazPost",
                    text: '"Pasamos de publicar cuando podíamos a tener contenido organizado para toda la semana. Eso nos quitó una carga enorme."',
                  },
                  {
                    init: "MC",
                    name: "Empresa de servicios",
                    role: "Prueba real HazPost",
                    text: '"Lo más valioso es que ya no empezamos desde cero. La IA propone, nosotros revisamos y publicamos más rápido."',
                  },
                  {
                    init: "AS",
                    name: "Emprendedora",
                    role: "Prueba real HazPost",
                    text: '"Antes dependía de sacar tiempo para redes. Ahora tengo ideas, captions y posts listos para aprobar."',
                  },
                ].map((t) => (
                  <article
                    key={t.name}
                    className="hz-tcard"
                    aria-label={`Testimonio de ${t.name}`}
                  >
                    <div className="hz-tcard-stars" aria-label="5 estrellas">
                      ★★★★★
                    </div>

                    <p className="hz-tcard-text">{t.text}</p>

                    <footer className="hz-tcard-author">
                      <div className="hz-avatar" aria-hidden="true">
                        {t.init}
                      </div>

                      <div>
                        <p className="hz-author-name">{t.name}</p>
                        <p className="hz-author-role">{t.role}</p>
                      </div>
                    </footer>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section
            className="hz-section"
            id="faq"
            aria-label="Preguntas frecuentes"
            style={{ maxWidth: "800px" }}
          >
            <div className="hz-label">Preguntas frecuentes</div>

            <h2 className="hz-title">
              ¿Tenés dudas? <span style={{ color: ACCENT }}>Acá respondemos todo.</span>
            </h2>

            <div className="hz-faq-list">
              {[
                {
                  q: "¿Qué es HazPost y para qué sirve?",
                  a: "HazPost es una plataforma SaaS que usa Inteligencia Artificial para crear, programar y publicar contenido en Instagram, TikTok y Facebook de forma automática. Diseñada para empresas, emprendedores y agencias de todo el mundo.",
                },
                {
                  q: "¿Necesito conocimientos de diseño o marketing?",
                  a: "No. Solo necesitás describir tu negocio una vez. La IA genera las imágenes, los textos y los hashtags adaptados a tu marca.",
                },
                {
                  q: "¿Funciona con Instagram de empresa y TikTok Business?",
                  a: "Sí. HazPost usa las APIs oficiales de Meta (Instagram Business) y TikTok Business. La conexión es segura vía OAuth.",
                },
                {
                  q: "¿Cómo pago? ¿Qué métodos de pago aceptan?",
                  a: "Sí. Aceptamos tarjetas de crédito y débito internacionales. Para usuarios en Colombia, también aceptamos pagos en pesos colombianos (COP) con PSE a través de Wompi.",
                },
                {
                  q: "¿Puedo cancelar en cualquier momento?",
                  a: "Sí, podés cancelar tu suscripción cuando quieras desde la configuración de tu cuenta. No hay contratos ni cargos ocultos. Los 30 días de prueba son completamente gratis.",
                },
                {
                  q: "¿Puedo manejar múltiples negocios o clientes?",
                  a: "Sí. Los planes Negocio y Agencia permiten gestionar múltiples clientes desde una sola cuenta. Ideal para agencias de marketing digital o usuarios que tengan varios negocios.",
                },
              ].map((f) => (
                <div key={f.q} className="hz-faq-item">
                  <div className="hz-faq-q">{f.q}</div>
                  <div className="hz-faq-a">{f.a}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="hz-cta-wrap" aria-label="Comenzar con HazPost">
            <div className="hz-cta-box">
              <h2>
                Empieza hoy y automatiza
                <br />
                <span style={{ color: ACCENT }}>el contenido de tu negocio</span>
              </h2>

              <p>
                Crea contenido, organiza tu calendario y publica sin volver a empezar desde
                cero cada semana.
              </p>

              <a href="/register" className="hz-btn-primary">
                Crear contenido automático ahora →
              </a>

              <div className="hz-nocc">
                ✓ Empieza en minutos · ✓ Sin complicaciones · ✓ Cancela cuando quieras
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="hz-footer">
        <div className="hz-footer-top">
          <div className="hz-footer-brand">
            <a href="/" className="hz-logo" style={{ fontSize: "1.25rem" }}>
              <span className="w">haz</span>
              <span className="c">post</span>
            </a>

            <p>
              Gestión de redes sociales con IA para empresas en Colombia y Latinoamérica.
            </p>
          </div>

          <div className="hz-flinks">
            <h4>Producto</h4>
            <ul>
              <li><a href="#funciones">Funciones</a></li>
              <li><a href="#precios">Precios</a></li>
              <li><a href="#como-funciona">Cómo funciona</a></li>
              <li><a href="/register">Prueba gratis</a></li>
            </ul>
          </div>

          <div className="hz-flinks">
            <h4>Legal</h4>
            <ul>
              <li><a href="/privacy-policy">Política de privacidad</a></li>
              <li><a href="/terms-of-service">Términos de servicio</a></li>
              <li><a href="/data-deletion">Eliminación de datos</a></li>
            </ul>
          </div>

          <div className="hz-flinks">
            <h4>Contacto</h4>
            <ul>
              <li>
                <a href="https://instagram.com/hazpost.app" rel="noopener noreferrer" target="_blank">
                  Instagram
                </a>
              </li>
              <li>
                <a href="https://www.facebook.com/hazpost" rel="noopener noreferrer" target="_blank">
                  Facebook
                </a>
              </li>
              <li><a href="mailto:hola@hazpost.app">hola@hazpost.app</a></li>
              <li><a href="/register">Empezar gratis</a></li>
            </ul>
          </div>
        </div>

        <div className="hz-footer-bottom">
          <p>© 2026 HazPost. Hecho con ❤️</p>

          <div style={{ display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap" }}>
            <a
              href="/terms-of-service"
              style={{ color: MUTED, fontSize: "0.78rem", textDecoration: "none" }}
              onMouseOver={(e) => (e.currentTarget.style.color = "#fff")}
              onMouseOut={(e) => (e.currentTarget.style.color = MUTED)}
            >
              Términos de servicio
            </a>

            <a
              href="/privacy-policy"
              style={{ color: MUTED, fontSize: "0.78rem", textDecoration: "none" }}
              onMouseOver={(e) => (e.currentTarget.style.color = "#fff")}
              onMouseOut={(e) => (e.currentTarget.style.color = MUTED)}
            >
              Privacidad
            </a>

            <a
              href="/data-deletion"
              style={{ color: MUTED, fontSize: "0.78rem", textDecoration: "none" }}
              onMouseOver={(e) => (e.currentTarget.style.color = "#fff")}
              onMouseOut={(e) => (e.currentTarget.style.color = MUTED)}
            >
              Eliminación de datos
            </a>

            <p style={{ color: ACCENT, fontSize: "0.78rem", fontWeight: 600 }}>
              haz<span style={{ color: MUTED }}>post</span>.app
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
