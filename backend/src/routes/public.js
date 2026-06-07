const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

router.get('/ads', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM advertisements WHERE active=1 ORDER BY ad_order,created_at').all());
});

router.get('/courses', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT id,title,description,thumbnail FROM courses WHERE active=1 ORDER BY created_at DESC').all());
});

// ── Nội dung trang công khai (chỉ lấy mục đang bật) ────────────────────
router.get('/featured-students', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM featured_students WHERE active=1 ORDER BY display_order, created_at DESC').all());
});

router.get('/staff', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM staff WHERE active=1 ORDER BY display_order, created_at DESC').all());
});

router.get('/featured-courses', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM featured_courses WHERE active=1 ORDER BY display_order, created_at DESC').all());
});

router.get('/achievements', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM achievements WHERE active=1 ORDER BY display_order, created_at DESC').all());
});

router.get('/settings', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key,value FROM site_settings').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

module.exports = router;
