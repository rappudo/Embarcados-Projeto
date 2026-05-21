-- FaceGateway — demo seed
--
-- 25 fictional employees (10 manhã, 8 tarde, 7 noite),
-- 1 week of access_events (2026-05-14 → 2026-05-20, ~280 rows including
-- ~22 unknowns spread across the week),
-- 2 users: admin@facegate.local / admin123 and teste@facegate.local / teste123
-- (passwords stored as SHA-256 hex — same scheme as 00_init.sql).
--
-- Restore command (from repo root):
--   docker exec -i facegate-db psql -U facegate -d facegate < infra/seed_demo.sql
--
-- The schema must already be applied via 00_init.sql + 01_add_direction.sql +
-- 02_upgrade_to_arcface.sql before running this seed.

BEGIN;

TRUNCATE TABLE
    access_events,
    employees,
    users
RESTART IDENTITY CASCADE;

--
-- PostgreSQL database dump
--

\restrict c7QNa7TnZ0wNoi7vTjobc5wswykq8VKOO4iKevzS2bG40oiB6OdrrcpOwDf5r6G

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg12+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.employees (id, name, shift, created_at) VALUES (1, 'Ana Silva', 'manhã', '2025-11-21 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (2, 'Bruno Oliveira', 'manhã', '2025-12-21 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (3, 'Carla Santos', 'tarde', '2025-12-01 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (4, 'Diego Souza', 'noite', '2026-01-30 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (5, 'Eduarda Lima', 'manhã', '2026-02-09 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (6, 'Felipe Costa', 'tarde', '2026-02-19 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (7, 'Gabriela Ferreira', 'manhã', '2026-02-24 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (8, 'Henrique Alves', 'noite', '2026-03-06 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (9, 'Isabela Rodrigues', 'tarde', '2026-03-11 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (10, 'João Pereira', 'manhã', '2026-03-21 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (11, 'Karina Martins', 'noite', '2026-03-26 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (12, 'Lucas Almeida', 'tarde', '2026-03-31 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (13, 'Mariana Ribeiro', 'manhã', '2026-04-05 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (14, 'Nicolas Carvalho', 'noite', '2026-04-10 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (15, 'Olivia Gomes', 'tarde', '2026-04-15 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (16, 'Paulo Mendes', 'manhã', '2026-01-20 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (17, 'Raquel Araújo', 'noite', '2025-12-11 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (18, 'Rafael Barbosa', 'tarde', '2026-02-14 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (19, 'Sofia Cardoso', 'manhã', '2026-02-21 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (20, 'Thiago Nascimento', 'noite', '2025-10-22 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (21, 'Vitória Pinto', 'tarde', '2026-03-16 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (22, 'Wesley Moreira', 'manhã', '2026-03-24 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (23, 'Yasmin Castro', 'noite', '2026-04-08 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (24, 'Zeca Teixeira', 'tarde', '2026-04-12 18:51:44.951572+00');
INSERT INTO public.employees (id, name, shift, created_at) VALUES (25, 'Júlia Rocha', 'manhã', '2026-04-20 18:51:44.951572+00');


--
-- Data for Name: access_events; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (1, 1, 'granted', 0.3067, 1778756617000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (2, 2, 'granted', 0.4257, 1778757760000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (3, 3, 'granted', 0.334, 1778777621000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (4, 4, 'granted', 0.39, 1778806483000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (5, 5, 'granted', 0.251, 1778755970000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (6, 6, 'granted', 0.3695, 1778778297000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (7, 7, 'granted', 0.3468, 1778756621000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (8, 8, 'granted', 0.296, 1778806764000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (9, 9, 'granted', 0.3529, 1778780224000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (10, 10, 'granted', 0.3751, 1778757872000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (11, 11, 'granted', 0.4451, 1778807593000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (12, 12, 'granted', 0.3857, 1778778124000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (13, 13, 'granted', 0.2799, 1778757669000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (14, 14, 'granted', 0.3238, 1778807071000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (15, 15, 'granted', 0.336, 1778778003000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (16, 16, 'granted', 0.4229, 1778757324000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (17, 17, 'granted', 0.4209, 1778807288000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (18, 18, 'granted', 0.3012, 1778778315000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (19, 19, 'granted', 0.3981, 1778756411000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (20, 20, 'granted', 0.3379, 1778806735000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (21, 21, 'granted', 0.3895, 1778778681000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (22, 22, 'granted', 0.2598, 1778756479000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (23, 23, 'granted', 0.2855, 1778808176000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (24, 24, 'granted', 0.304, 1778778101000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (25, 25, 'granted', 0.3503, 1778756061000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (26, 1, 'granted', 0.3237, 1778844114000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (27, 2, 'granted', 0.3633, 1778844286000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (28, 3, 'granted', 0.4409, 1778865925000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (29, 4, 'granted', 0.3015, 1778893369000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (30, 5, 'granted', 0.3193, 1778843024000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (31, 6, 'granted', 0.3225, 1778864848000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (32, 7, 'granted', 0.4185, 1778843933000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (33, 8, 'granted', 0.3723, 1778895282000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (34, 9, 'granted', 0.3056, 1778865875000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (35, 10, 'granted', 0.4441, 1778843432000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (36, 11, 'granted', 0.2575, 1778892967000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (37, 12, 'granted', 0.4109, 1778866660000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (38, 13, 'granted', 0.35, 1778843392000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (39, 14, 'granted', 0.3875, 1778894258000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (40, 15, 'granted', 0.3094, 1778863923000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (41, 16, 'granted', 0.3546, 1778842548000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (42, 17, 'granted', 0.4396, 1778894397000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (43, 18, 'granted', 0.4323, 1778864104000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (44, 19, 'granted', 0.393, 1778843970000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (45, 20, 'granted', 0.4038, 1778894083000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (46, 21, 'granted', 0.3254, 1778865532000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (47, 22, 'granted', 0.4219, 1778843006000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (48, 23, 'granted', 0.3582, 1778893265000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (49, 24, 'granted', 0.2534, 1778866244000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (50, 25, 'granted', 0.4472, 1778842652000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (51, 3, 'granted', 0.3319, 1778951013000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (52, 7, 'granted', 0.4278, 1778929453000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (53, 8, 'granted', 0.4357, 1778980760000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (54, 12, 'granted', 0.4318, 1778950797000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (55, 14, 'granted', 0.3905, 1778980672000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (56, 15, 'granted', 0.3677, 1778951006000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (57, 16, 'granted', 0.2788, 1778929069000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (58, 18, 'granted', 0.4008, 1778951796000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (59, 22, 'granted', 0.3934, 1778928919000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (60, 23, 'granted', 0.3284, 1778980797000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (61, 25, 'granted', 0.3053, 1778929510000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (62, 1, 'granted', 0.2649, 1779015755000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (63, 2, 'granted', 0.2662, 1779017101000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (64, 7, 'granted', 0.2786, 1779017678000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (65, 10, 'granted', 0.2928, 1779015668000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (66, 12, 'granted', 0.32, 1779037342000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (67, 15, 'granted', 0.4262, 1779037553000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (68, 19, 'granted', 0.3125, 1779016129000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (69, 22, 'granted', 0.3764, 1779016804000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (70, 23, 'granted', 0.4248, 1779065654000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (71, 1, 'granted', 0.3056, 1779104023000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (72, 2, 'granted', 0.4222, 1779101649000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (73, 3, 'granted', 0.3775, 1779125027000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (74, 4, 'granted', 0.3408, 1779153812000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (75, 5, 'granted', 0.2652, 1779102138000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (76, 6, 'granted', 0.3212, 1779123856000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (77, 7, 'granted', 0.4224, 1779102747000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (78, 8, 'granted', 0.3821, 1779153403000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (79, 9, 'granted', 0.2539, 1779123431000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (80, 10, 'granted', 0.4418, 1779103536000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (81, 11, 'granted', 0.4466, 1779153443000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (82, 12, 'granted', 0.4143, 1779123432000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (83, 13, 'granted', 0.3912, 1779102560000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (84, 14, 'granted', 0.2856, 1779152425000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (85, 15, 'granted', 0.3304, 1779124648000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (86, 16, 'granted', 0.3684, 1779103377000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (87, 17, 'granted', 0.3519, 1779152638000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (88, 18, 'granted', 0.3759, 1779124580000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (89, 19, 'granted', 0.3554, 1779103441000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (90, 20, 'granted', 0.3151, 1779153913000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (91, 21, 'granted', 0.3131, 1779123038000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (92, 22, 'granted', 0.4174, 1779102320000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (93, 23, 'granted', 0.3737, 1779153186000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (94, 24, 'granted', 0.2747, 1779124082000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (95, 25, 'granted', 0.2595, 1779103332000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (96, 1, 'granted', 0.3312, 1779190493000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (97, 2, 'granted', 0.314, 1779188555000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (98, 3, 'granted', 0.3834, 1779209651000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (99, 4, 'granted', 0.2744, 1779239393000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (100, 5, 'granted', 0.3478, 1779189822000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (101, 6, 'granted', 0.3276, 1779209807000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (102, 7, 'granted', 0.3755, 1779189450000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (103, 8, 'granted', 0.3123, 1779238723000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (104, 9, 'granted', 0.4149, 1779209933000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (105, 10, 'granted', 0.3778, 1779189599000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (106, 11, 'granted', 0.4002, 1779240049000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (107, 12, 'granted', 0.334, 1779210080000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (108, 13, 'granted', 0.3899, 1779188676000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (109, 14, 'granted', 0.433, 1779239031000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (110, 15, 'granted', 0.2869, 1779210735000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (111, 16, 'granted', 0.4308, 1779188654000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (112, 17, 'granted', 0.3498, 1779239450000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (113, 18, 'granted', 0.2925, 1779211125000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (114, 19, 'granted', 0.4421, 1779188295000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (115, 20, 'granted', 0.304, 1779239799000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (116, 21, 'granted', 0.3026, 1779210532000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (117, 22, 'granted', 0.3548, 1779190014000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (118, 23, 'granted', 0.4382, 1779238797000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (119, 24, 'granted', 0.2665, 1779212129000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (120, 25, 'granted', 0.3439, 1779188158000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (121, 1, 'granted', 0.4029, 1779275994000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (122, 2, 'granted', 0.4406, 1779275231000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (123, 3, 'granted', 0.2894, 1779297826000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (125, 5, 'granted', 0.4407, 1779275207000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (126, 6, 'granted', 0.2732, 1779296541000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (127, 7, 'granted', 0.3825, 1779275811000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (129, 9, 'granted', 0.3207, 1779296301000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (130, 10, 'granted', 0.349, 1779275468000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (132, 12, 'granted', 0.4309, 1779295812000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (133, 13, 'granted', 0.3257, 1779276207000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (135, 15, 'granted', 0.4394, 1779297774000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (136, 16, 'granted', 0.2693, 1779275477000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (138, 18, 'granted', 0.3657, 1779296446000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (139, 19, 'granted', 0.3175, 1779275982000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (141, 21, 'granted', 0.2919, 1779296691000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (142, 22, 'granted', 0.2659, 1779276324000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (144, 24, 'granted', 0.3139, 1779296089000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (145, 25, 'granted', 0.3372, 1779275726000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (146, 1, 'granted', 0.3416, 1778785551000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (147, 2, 'granted', 0.2511, 1778787324000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (148, 3, 'granted', 0.3565, 1778806019000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (149, 4, 'granted', 0.3052, 1778834381000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (150, 5, 'granted', 0.4372, 1778785566000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (151, 6, 'granted', 0.3124, 1778807634000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (152, 7, 'granted', 0.3524, 1778786304000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (153, 8, 'granted', 0.3481, 1778836059000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (154, 9, 'granted', 0.4034, 1778808554000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (155, 10, 'granted', 0.3575, 1778787394000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (156, 11, 'granted', 0.4182, 1778835776000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (157, 12, 'granted', 0.2834, 1778806611000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (158, 13, 'granted', 0.4292, 1778786404000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (159, 14, 'granted', 0.4484, 1778835634000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (160, 15, 'granted', 0.373, 1778806715000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (161, 16, 'granted', 0.2832, 1778786150000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (162, 17, 'granted', 0.3664, 1778835378000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (163, 18, 'granted', 0.2819, 1778806717000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (164, 19, 'granted', 0.3112, 1778785477000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (165, 20, 'granted', 0.3942, 1778834966000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (166, 21, 'granted', 0.355, 1778807506000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (167, 22, 'granted', 0.2531, 1778786114000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (168, 23, 'granted', 0.2762, 1778836887000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (169, 24, 'granted', 0.3176, 1778807495000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (170, 25, 'granted', 0.34, 1778784009000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (171, 1, 'granted', 0.2997, 1778873232000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (172, 2, 'granted', 0.3368, 1778873806000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (173, 3, 'granted', 0.4118, 1778895279000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (174, 4, 'granted', 0.2915, 1778921815000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (175, 5, 'granted', 0.3621, 1778871707000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (176, 6, 'granted', 0.4107, 1778894497000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (177, 7, 'granted', 0.4464, 1778872168000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (178, 8, 'granted', 0.3983, 1778923243000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (179, 9, 'granted', 0.3685, 1778894582000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (180, 10, 'granted', 0.3749, 1778872451000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (181, 11, 'granted', 0.3744, 1778921536000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (182, 12, 'granted', 0.4042, 1778895757000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (183, 13, 'granted', 0.4156, 1778871651000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (184, 14, 'granted', 0.3417, 1778923345000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (185, 15, 'granted', 0.3, 1778893408000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (186, 16, 'granted', 0.2587, 1778871904000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (187, 17, 'granted', 0.4438, 1778923728000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (188, 18, 'granted', 0.2717, 1778893701000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (189, 19, 'granted', 0.2774, 1778872457000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (190, 20, 'granted', 0.3586, 1778921960000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (191, 21, 'granted', 0.2803, 1778894005000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (192, 22, 'granted', 0.3755, 1778871935000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (193, 23, 'granted', 0.3057, 1778921962000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (194, 24, 'granted', 0.3863, 1778894932000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (195, 25, 'granted', 0.3384, 1778870865000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (196, 3, 'granted', 0.274, 1778978975000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (197, 7, 'granted', 0.2824, 1778958815000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (198, 8, 'granted', 0.3786, 1779009159000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (199, 12, 'granted', 0.3379, 1778979667000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (200, 14, 'granted', 0.363, 1779009127000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (201, 15, 'granted', 0.4379, 1778979183000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (202, 16, 'granted', 0.3205, 1778958186000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (203, 18, 'granted', 0.3314, 1778979730000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (204, 22, 'granted', 0.4239, 1778957872000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (205, 23, 'granted', 0.2879, 1779008817000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (206, 25, 'granted', 0.3597, 1778958614000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (207, 1, 'granted', 0.4426, 1779044127000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (208, 2, 'granted', 0.3413, 1779046363000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (209, 7, 'granted', 0.3067, 1779047279000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (210, 10, 'granted', 0.2796, 1779045003000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (211, 12, 'granted', 0.347, 1779066074000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (212, 15, 'granted', 0.4129, 1779067219000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (213, 19, 'granted', 0.4271, 1779045381000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (214, 22, 'granted', 0.3279, 1779045331000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (215, 23, 'granted', 0.344, 1779094125000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (216, 1, 'granted', 0.3435, 1779132249000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (217, 2, 'granted', 0.3799, 1779129640000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (218, 3, 'granted', 0.4116, 1779153410000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (219, 4, 'granted', 0.322, 1779181780000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (220, 5, 'granted', 0.2503, 1779131007000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (221, 6, 'granted', 0.4375, 1779153170000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (222, 7, 'granted', 0.2628, 1779132191000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (223, 8, 'granted', 0.4446, 1779181266000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (224, 9, 'granted', 0.4, 1779152127000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (225, 10, 'granted', 0.361, 1779132447000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (226, 11, 'granted', 0.3187, 1779182481000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (227, 12, 'granted', 0.3651, 1779153177000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (228, 13, 'granted', 0.4128, 1779131845000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (229, 14, 'granted', 0.3794, 1779180361000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (230, 15, 'granted', 0.2658, 1779152636000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (231, 16, 'granted', 0.2824, 1779131339000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (232, 17, 'granted', 0.3699, 1779181559000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (233, 18, 'granted', 0.3888, 1779152831000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (234, 19, 'granted', 0.3755, 1779132945000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (235, 20, 'granted', 0.3839, 1779183232000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (236, 21, 'granted', 0.4244, 1779151604000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (237, 22, 'granted', 0.3262, 1779130570000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (238, 23, 'granted', 0.4212, 1779182098000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (239, 24, 'granted', 0.4013, 1779153086000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (240, 25, 'granted', 0.4436, 1779131389000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (241, 1, 'granted', 0.3571, 1779219648000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (242, 2, 'granted', 0.2781, 1779217614000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (243, 3, 'granted', 0.3776, 1779239342000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (244, 4, 'granted', 0.3505, 1779268303000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (245, 5, 'granted', 0.4026, 1779217909000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (246, 6, 'granted', 0.3803, 1779238097000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (247, 7, 'granted', 0.3202, 1779217592000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (248, 8, 'granted', 0.2676, 1779268058000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (249, 9, 'granted', 0.326, 1779239464000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (250, 10, 'granted', 0.2786, 1779218097000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (251, 11, 'granted', 0.3265, 1779269681000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (252, 12, 'granted', 0.428, 1779237965000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (253, 13, 'granted', 0.3499, 1779217012000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (254, 14, 'granted', 0.3266, 1779267337000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (255, 15, 'granted', 0.2699, 1779239269000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (256, 16, 'granted', 0.3872, 1779217407000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (257, 17, 'granted', 0.2995, 1779267568000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (258, 18, 'granted', 0.3014, 1779239489000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (259, 19, 'granted', 0.3305, 1779217361000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (260, 20, 'granted', 0.4273, 1779269018000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (261, 21, 'granted', 0.3206, 1779239833000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (262, 22, 'granted', 0.3774, 1779218810000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (263, 23, 'granted', 0.3439, 1779267840000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (264, 24, 'granted', 0.292, 1779241424000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (265, 25, 'granted', 0.4273, 1779217213000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'out');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (292, NULL, 'unknown', 0.5715, 1779239819000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (293, NULL, 'unknown', 0.6648, 1779171892000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (294, NULL, 'unknown', 0.5903, 1778975932000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (295, NULL, 'unknown', 0.5838, 1779074792000, 'edge-01', '2026-05-20 18:51:44.951572+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (296, NULL, 'unknown', 0.7005, 1779108157000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (297, NULL, 'unknown', 0.6387, 1779113509000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (298, NULL, 'unknown', 0.6134, 1779209903000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (299, NULL, 'unknown', 0.6681, 1778982544000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (300, NULL, 'unknown', 0.671, 1778793462000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (301, NULL, 'unknown', 0.7018, 1778958287000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (302, NULL, 'unknown', 0.6484, 1779199367000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (303, NULL, 'unknown', 0.71, 1779040813000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (304, NULL, 'unknown', 0.6833, 1779041339000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (305, NULL, 'unknown', 0.6579, 1779234776000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (306, NULL, 'unknown', 0.5601, 1778870021000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (307, NULL, 'unknown', 0.7269, 1779199775000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (308, NULL, 'unknown', 0.5932, 1778969926000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (309, NULL, 'unknown', 0.7336, 1778883004000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (310, NULL, 'unknown', 0.577, 1779041115000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (311, NULL, 'unknown', 0.6974, 1778962438000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (312, NULL, 'unknown', 0.5781, 1778971441000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');
INSERT INTO public.access_events (id, employee_id, status, distance, timestamp_ms, device_id, created_at, direction) VALUES (313, NULL, 'unknown', 0.7349, 1779211386000, 'edge-01', '2026-05-20 19:07:58.587124+00', 'in');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users (id, email, password_hash, created_at) VALUES (1, 'admin@facegate.local', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', '2026-05-13 19:05:46.359538+00');
INSERT INTO public.users (id, email, password_hash, created_at) VALUES (2, 'teste@facegate.local', '289160db0d9f39f9ae1754c4ec9c16f90b50e32e09c5fb5481ae642b3d3d1a36', '2026-05-20 18:28:46.944771+00');


--
-- Name: access_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.access_events_id_seq', 313, true);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employees_id_seq', 25, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 2, true);


--
-- PostgreSQL database dump complete
--

\unrestrict c7QNa7TnZ0wNoi7vTjobc5wswykq8VKOO4iKevzS2bG40oiB6OdrrcpOwDf5r6G

COMMIT;
