/**
 * Trade risk map.
 * Loads hotspots.json and news.json. Does not embed scores in the page.
 */
(function () {
    const COVERAGE_LABELS = {
        political_risk: "Political risk",
        trade_credit: "Trade credit",
        kidnap_ransom: "Kidnap & ransom"
    };
    const EXPOSURE_LABELS = {
        expropriation: "Expropriation",
        currency_inconvertibility: "Currency inconvertibility",
        political_violence: "Political violence",
        contract_frustration: "Contract frustration",
        sovereign_default: "Sovereign default",
        buyer_default: "Buyer default",
        sanctions: "Sanctions"
    };
    const MONTHS = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const state = {
        hotspots: [],
        articles: [],
        filtered: [],
        filter: "all",
        query: "",
        sort: "name",
        selectedId: null,
        map: null,
        mapReady: false,
        dataReady: false
    };

    document.addEventListener("DOMContentLoaded", () => {
        bindControls();
        initMap();
        loadData();
    });

    function bindControls() {
        document.getElementById("search-input").addEventListener("input", (event) => {
            state.query = event.target.value.trim().toLowerCase();
            applyFilters();
        });
        document.getElementById("sort-select").addEventListener("change", (event) => {
            state.sort = event.target.value;
            applyFilters();
        });
        document.querySelectorAll(".filter-pill").forEach((button) => {
            button.addEventListener("click", () => setFilter(button.dataset.filter));
        });
        document.getElementById("detail-close").addEventListener("click", closeDetail);
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && state.selectedId) closeDetail();
        });
    }

    function initMap() {
        state.map = new maplibregl.Map({
            container: "map-canvas",
            style: "https://tiles.openfreemap.org/styles/positron",
            center: [10, 18],
            zoom: 1.45,
            minZoom: 1,
            maxZoom: 7,
            attributionControl: { compact: true }
        });
        state.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        state.map.on("load", () => {
            state.map.addSource("markets", {
                type: "geojson",
                data: emptyCollection(),
                cluster: true,
                clusterRadius: 42,
                clusterMaxZoom: 3
            });
            state.map.addLayer({
                id: "clusters",
                type: "circle",
                source: "markets",
                filter: ["has", "point_count"],
                paint: {
                    "circle-color": "#ffffff",
                    "circle-stroke-width": 2,
                    "circle-stroke-color": "#1e293b",
                    "circle-radius": ["step", ["get", "point_count"], 14, 8, 18, 20, 22]
                }
            });
            state.map.addLayer({
                id: "cluster-count",
                type: "symbol",
                source: "markets",
                filter: ["has", "point_count"],
                layout: {
                    "text-field": ["get", "point_count_abbreviated"],
                    "text-font": styleTextFont(state.map),
                    "text-size": 12
                },
                paint: { "text-color": "#1e293b" }
            });
            state.map.addLayer({
                id: "selected-halo",
                type: "circle",
                source: "markets",
                filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "selected"], 1]],
                paint: {
                    "circle-radius": 14,
                    "circle-color": "rgba(0, 0, 0, 0.12)",
                    "circle-stroke-width": 2,
                    "circle-stroke-color": "#000000"
                }
            });
            state.map.addLayer({
                id: "points",
                type: "circle",
                source: "markets",
                filter: ["!", ["has", "point_count"]],
                paint: {
                    "circle-radius": [
                        "interpolate", ["linear"], ["zoom"],
                        1, ["match", ["get", "oecd_category"], 7, 5, 6, 4.5, 4],
                        4, ["match", ["get", "oecd_category"], 7, 8, 6, 7, 6]
                    ],
                    "circle-color": [
                        "match", ["get", "oecd_category"],
                        7, "#000000",
                        6, "#1e293b",
                        5, "#64748b",
                        "#ffffff"
                    ],
                    "circle-stroke-width": ["match", ["get", "kind"], "region", 2, 1],
                    "circle-stroke-color": "#000000"
                }
            });

            state.map.on("click", "clusters", (event) => {
                const feature = event.features && event.features[0];
                if (!feature) return;
                const source = state.map.getSource("markets");
                source.getClusterExpansionZoom(feature.properties.cluster_id).then((zoom) => {
                    state.map.easeTo({ center: feature.geometry.coordinates, zoom });
                }).catch(() => {});
            });
            state.map.on("click", "points", (event) => {
                const feature = event.features && event.features[0];
                if (!feature) return;
                const hotspot = state.hotspots.find((item) => item.id === feature.properties.id);
                if (hotspot) selectHotspot(hotspot, { fly: false });
            });
            state.map.on("mouseenter", "points", () => {
                state.map.getCanvas().style.cursor = "pointer";
            });
            state.map.on("mouseleave", "points", () => {
                state.map.getCanvas().style.cursor = "";
            });
            state.map.on("mouseenter", "clusters", () => {
                state.map.getCanvas().style.cursor = "pointer";
            });
            state.map.on("mouseleave", "clusters", () => {
                state.map.getCanvas().style.cursor = "";
            });

            state.mapReady = true;
            if (state.dataReady) {
                applyFilters();
                openFromQuery();
            }
        });
    }

    async function loadData() {
        const list = document.getElementById("market-list");
        try {
            const [hotspotRes, newsRes] = await Promise.all([
                fetch("hotspots.json"),
                fetch("news.json")
            ]);
            if (!hotspotRes.ok || !newsRes.ok) throw new Error("fetch failed");
            const hotspotData = await hotspotRes.json();
            const newsData = await newsRes.json();
            state.hotspots = Array.isArray(hotspotData.hotspots) ? hotspotData.hotspots : [];
            state.articles = Array.isArray(newsData.articles) ? newsData.articles : [];
            const updated = document.getElementById("data-updated");
            if (updated && hotspotData.lastUpdated) {
                updated.textContent = "Data checked " + formatDate(hotspotData.lastUpdated) + ".";
            }
            state.dataReady = true;
            renderNews(state.articles);
            if (state.mapReady) {
                applyFilters();
                openFromQuery();
            } else {
                applyFilters();
            }
        } catch (error) {
            list.innerHTML = '<p class="map-list-status">The market list could not be loaded. Reload the page to try again.</p>';
        }
    }

    function openFromQuery() {
        const id = new URLSearchParams(window.location.search).get("id");
        if (!id) return;
        const hotspot = state.hotspots.find((item) => item.id === id);
        if (hotspot) selectHotspot(hotspot, { fly: true });
    }

    function setFilter(filter) {
        state.filter = filter;
        document.querySelectorAll(".filter-pill").forEach((button) => {
            const on = button.dataset.filter === filter;
            button.setAttribute("aria-pressed", on ? "true" : "false");
        });
        applyFilters();
    }

    function applyFilters() {
        let list = state.hotspots.filter(matchesQuery).filter(matchesFilter);
        if (state.sort === "oecd") {
            list.sort((a, b) => {
                const av = a.oecd_category == null ? -1 : a.oecd_category;
                const bv = b.oecd_category == null ? -1 : b.oecd_category;
                if (bv !== av) return bv - av;
                return a.name.localeCompare(b.name);
            });
        } else if (state.sort === "verified") {
            list.sort((a, b) => String(b.last_verified).localeCompare(String(a.last_verified)) || a.name.localeCompare(b.name));
        } else {
            list.sort((a, b) => a.name.localeCompare(b.name));
        }
        state.filtered = list;
        const selectedStillVisible = list.some((item) => item.id === state.selectedId);
        if (state.selectedId && !selectedStillVisible) {
            state.selectedId = null;
            hideDrawer();
        }
        renderList();
        syncMap();
    }

    function matchesQuery(hotspot) {
        if (!state.query) return true;
        const haystack = [
            hotspot.name,
            hotspot.iso3,
            hotspot.notes,
            ...(hotspot.coverages || []).map((key) => COVERAGE_LABELS[key] || key),
            ...(hotspot.exposures || []).map((key) => EXPOSURE_LABELS[key] || key)
        ].join(" ").toLowerCase();
        return haystack.includes(state.query);
    }

    function matchesFilter(hotspot) {
        switch (state.filter) {
            case "political_risk":
                return includes(hotspot.coverages, "political_risk");
            case "trade_credit":
                return includes(hotspot.coverages, "trade_credit");
            case "kidnap_ransom":
                return includes(hotspot.coverages, "kidnap_ransom");
            case "oecd_6_7":
                return hotspot.oecd_category === 6 || hotspot.oecd_category === 7;
            case "exposure_political_violence":
                return includes(hotspot.exposures, "political_violence");
            case "exposure_sanctions":
                return includes(hotspot.exposures, "sanctions");
            case "exposure_expropriation":
                return includes(hotspot.exposures, "expropriation");
            default:
                return true;
        }
    }

    function renderList() {
        const list = document.getElementById("market-list");
        const count = document.getElementById("filtered-count");
        const noun = state.filtered.length === 1 ? "market" : "markets";
        count.textContent = state.filtered.length + " " + noun;
        if (state.filtered.length === 0) {
            list.innerHTML = '<p class="map-empty">No markets match this search and filter.</p>';
            return;
        }
        list.innerHTML = state.filtered.map((hotspot) => {
            const current = hotspot.id === state.selectedId ? ' aria-current="true"' : "";
            const category = hotspot.oecd_category == null ? "No OECD category" : "OECD " + hotspot.oecd_category;
            const kind = hotspot.kind === "region" ? "Region" : "Country";
            return (
                '<div class="market-row-wrap">' +
                '<button type="button" class="market-row" data-id="' + escapeHtml(hotspot.id) + '"' + current + '>' +
                '<div class="market-row-name">' + escapeHtml(hotspot.name) + "</div>" +
                '<div class="market-row-meta"><span>' + escapeHtml(kind) + "</span><span>" + escapeHtml(category) + "</span></div>" +
                "</button>" +
                '<div class="market-row-meta market-row-source-line">' +
                '<a class="market-row-source" href="' + escapeHtml(hotspot.source_url) + '" target="_blank" rel="noopener noreferrer">Source</a>' +
                "</div></div>"
            );
        }).join("");
        list.querySelectorAll(".market-row").forEach((button) => {
            button.addEventListener("click", () => {
                const hotspot = state.hotspots.find((item) => item.id === button.dataset.id);
                if (hotspot) selectHotspot(hotspot, { fly: true });
            });
        });
    }

    function syncMap() {
        if (!state.mapReady) return;
        const source = state.map.getSource("markets");
        if (!source) return;
        source.setData({
            type: "FeatureCollection",
            features: state.filtered.map((hotspot) => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [hotspot.lng, hotspot.lat] },
                properties: {
                    id: hotspot.id,
                    name: hotspot.name,
                    kind: hotspot.kind,
                    oecd_category: hotspot.oecd_category == null ? 0 : hotspot.oecd_category,
                    selected: hotspot.id === state.selectedId ? 1 : 0
                }
            }))
        });
    }

    function selectHotspot(hotspot, options) {
        state.selectedId = hotspot.id;
        const url = new URL(window.location.href);
        url.searchParams.set("id", hotspot.id);
        window.history.replaceState({}, "", url);
        renderList();
        syncMap();
        renderDetail(hotspot);
        const drawer = document.getElementById("detail-drawer");
        drawer.hidden = false;
        document.getElementById("detail-close").focus();
        if (options.fly && state.mapReady) {
            state.map.easeTo({
                center: [hotspot.lng, hotspot.lat],
                zoom: Math.max(state.map.getZoom(), 3.4),
                padding: { right: window.innerWidth > 900 ? 440 : 0, top: 40, bottom: 40, left: 40 }
            });
        }
        const row = document.querySelector('.market-row[data-id="' + cssEscape(hotspot.id) + '"]');
        if (row) row.scrollIntoView({ block: "nearest" });
    }

    function renderDetail(hotspot) {
        const related = state.articles
            .filter((article) => (article.hotspot_ids || []).includes(hotspot.id))
            .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const categoryCell = hotspot.oecd_category == null
            ? "None. This pin is a place named in the source, not an OECD country category."
            : 'Category <strong>' + hotspot.oecd_category + "</strong>" +
                (hotspot.oecd_source_url
                    ? ' · <a href="' + escapeHtml(hotspot.oecd_source_url) + '" target="_blank" rel="noopener noreferrer">OECD list</a>'
                    : "");
        const location = hotspot.location_basis === "named_place"
            ? "Named geographic point from OpenStreetMap"
            : "Published country centroid";
        const relatedHtml = related.length
            ? '<ul class="news-list">' + related.map(newsCard).join("") + "</ul>"
            : "<p>No related market notes in the current file.</p>";
        document.getElementById("detail-body").innerHTML =
            '<p class="detail-kicker">' + escapeHtml(hotspot.kind === "region" ? "Region" : "Country") + "</p>" +
            '<h2 id="detail-title">' + escapeHtml(hotspot.name) + "</h2>" +
            '<div class="detail-chips">' + chips(hotspot.coverages, COVERAGE_LABELS) + "</div>" +
            '<table class="detail-meta"><tbody>' +
            row("OECD category", categoryCell, true) +
            row("Coverages", labels(hotspot.coverages, COVERAGE_LABELS)) +
            row("Exposures", hotspot.exposures && hotspot.exposures.length ? labels(hotspot.exposures, EXPOSURE_LABELS) : "None recorded beyond the OECD category itself.") +
            row("Map point", location) +
            row("Last verified", formatDate(hotspot.last_verified)) +
            "</tbody></table>" +
            '<div class="detail-section"><h3>Notes</h3><p>' + escapeHtml(hotspot.notes) + "</p></div>" +
            '<div class="detail-section"><h3>Related market notes</h3>' + relatedHtml + "</div>" +
            '<div class="detail-actions">' +
            '<a class="btn btn-secondary" href="' + escapeHtml(hotspot.source_url) + '" target="_blank" rel="noopener noreferrer">Primary source</a>' +
            '<a class="btn btn-primary" href="contact.html?market=' + encodeURIComponent(hotspot.name) + '">Ask about cover in ' + escapeHtml(hotspot.name) + "</a>" +
            "</div>";
    }

    function closeDetail() {
        state.selectedId = null;
        hideDrawer();
        const url = new URL(window.location.href);
        url.searchParams.delete("id");
        window.history.replaceState({}, "", url);
        renderList();
        syncMap();
        const search = document.getElementById("search-input");
        if (search) search.focus();
    }

    function hideDrawer() {
        document.getElementById("detail-drawer").hidden = true;
        document.getElementById("detail-body").innerHTML = "";
    }

    function renderNews(articles) {
        const list = document.getElementById("map-news-list");
        if (!list) return;
        const recent = articles.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
        if (!recent.length) {
            list.innerHTML = "<li>No market notes in the current file.</li>";
            return;
        }
        list.innerHTML = recent.map(newsCard).join("");
    }

    function newsCard(article) {
        const external = !String(article.url).startsWith("https://riskebiz.com");
        const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
        return (
            '<li class="news-card">' +
            '<div class="news-card-meta"><span class="chip">' + escapeHtml(article.source) + "</span><span>" + escapeHtml(formatDate(article.date)) + "</span></div>" +
            "<h3><a href=\"" + escapeHtml(article.url) + "\"" + attrs + ">" + escapeHtml(article.title) + "</a></h3>" +
            "<p>" + escapeHtml(article.summary) + "</p>" +
            "</li>"
        );
    }

    function chips(keys, labels) {
        return (keys || []).map((key) => '<span class="chip">' + escapeHtml(labels[key] || key) + "</span>").join("");
    }

    function labels(keys, dict) {
        return (keys || []).map((key) => dict[key] || key).join(", ");
    }

    function row(label, value, html) {
        return "<tr><th scope=\"row\">" + escapeHtml(label) + "</th><td>" + (html ? value : escapeHtml(value)) + "</td></tr>";
    }

    function formatDate(iso) {
        if (!iso || String(iso).length < 10) return "—";
        const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
        if (!year || !month || !day) return iso;
        return day + " " + MONTHS[month - 1] + " " + year;
    }

    function includes(list, value) {
        return Array.isArray(list) && list.includes(value);
    }

    function emptyCollection() {
        return { type: "FeatureCollection", features: [] };
    }

    function styleTextFont(map) {
        const layers = (map.getStyle() && map.getStyle().layers) || [];
        for (const layer of layers) {
            const font = layer.layout && layer.layout["text-font"];
            if (Array.isArray(font) && font.length) return font;
        }
        return ["Noto Sans Regular"];
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        }[ch]));
    }

    function cssEscape(value) {
        if (window.CSS && CSS.escape) return CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }
})();
