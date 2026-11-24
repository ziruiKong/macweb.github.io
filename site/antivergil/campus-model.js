/*
 * Columbia Morningside Heights axonometric model.
 * Building footprints and road geometry are projected from their real
 * latitude/longitude coordinates; landmark details are added in SVG.
 */
(function () {
  const BOUNDS = {
    north: 40.81025,
    south: 40.80545,
    west: -73.96455,
    east: -73.95935,
  };
  const VIEW = { width: 1500, height: 960, centerX: 750, centerY: 560 };
  const ROTATION_STEP = 15;
  const LANDMARKS = [
    {
      name: "Broadway Gate",
      label: "Broadway Gate",
      subtitle: "West entrance · College Walk",
      lat: 40.807987,
      lng: -73.963801,
      kind: "gate",
      labelOffset: [-74, -42],
      description: "The ceremonial western threshold where College Walk meets Broadway, framed by stone piers and ornamental ironwork.",
    },
    {
      name: "Low Memorial Library",
      label: "Low Library",
      subtitle: "Rotunda · 1897",
      kind: "low",
      labelOffset: [48, -74],
      description: "The granite centerpiece of the original campus plan, crowned by its monumental dome and reached through broad ceremonial steps.",
    },
    {
      name: "Alma Mater",
      label: "Alma Mater",
      subtitle: "Sculpture · Daniel Chester French",
      lat: 40.807817,
      lng: -73.962183,
      kind: "statue",
      labelOffset: [-96, 14],
      description: "The bronze Alma Mater sits on the axis between Low Library and the western campus gate.",
    },
    {
      name: "Butler Library",
      label: "Butler Library",
      subtitle: "South campus · 1934",
      kind: "butler",
      labelOffset: [22, 34],
      description: "The long colonnaded library facade closes the south side of the central campus and anchors the main undergraduate library.",
    },
    {
      name: "Saint Paul's Chapel",
      label: "St. Paul's Chapel",
      subtitle: "Chapel · 1907",
      kind: "chapel",
      labelOffset: [-108, 50],
      description: "A domed chapel and one of the clearest secondary landmarks on the eastern half of campus.",
    },
    {
      name: "Pupin Hall",
      label: "Pupin Hall",
      subtitle: "Physics · 1927",
      kind: "pupin",
      labelOffset: [62, -42],
      description: "The physics building where key early research on the Compton effect took place.",
    },
    {
      name: "Earl Hall",
      label: "Earl Hall",
      subtitle: "Religious life · 1902",
      kind: "earl",
      labelOffset: [-58, -34],
      description: "A small classical building near the western quadrangle, marked here with its tower-like entrance bay.",
    },
    {
      name: "Amsterdam Gate",
      label: "Amsterdam Gate",
      subtitle: "East entrance · College Walk",
      lat: 40.8068316,
      lng: -73.9610565,
      kind: "gate",
      labelOffset: [26, 48],
      description: "The eastern gate closes College Walk at Amsterdam Avenue, opposite the Broadway entrance.",
    },
  ];
  const LANDMARK_BY_NAME = new Map(LANDMARKS.map((item) => [item.name, item]));
  const MODEL_STATE = {
    rotation: -38,
    pitch: 58,
    labels: true,
    roads: true,
    selected: "",
    zoom: 1.45,
    panX: 0,
    panY: 0,
    dragging: false,
    dragStart: null,
    built: false,
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function polygonCentroid(poly) {
    let lat = 0;
    let lng = 0;
    for (const point of poly) {
      lat += Number(point[0]);
      lng += Number(point[1]);
    }
    return [lat / poly.length, lng / poly.length];
  }

  function normalizeBuildingName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]/g, "");
  }

  function inBounds(lat, lng, padding = 0) {
    return lat > BOUNDS.south - padding && lat < BOUNDS.north + padding
      && lng > BOUNDS.west - padding && lng < BOUNDS.east + padding;
  }

  function pointInPolygon(lat, lng, poly) {
    let inside = false;
    for (let index = 0, previous = poly.length - 1; index < poly.length; previous = index++) {
      const yi = Number(poly[index].lat ?? poly[index][0]);
      const xi = Number(poly[index].lon ?? poly[index][1]);
      const yj = Number(poly[previous].lat ?? poly[previous][0]);
      const xj = Number(poly[previous].lon ?? poly[previous][1]);
      const intersects = ((yi > lat) !== (yj > lat))
        && (lng < (xj - xi) * (lat - yi) / ((yj - yi) || Number.EPSILON) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function offsetGeo(lat, lng, xMeters, yMeters) {
    return [
      lat + yMeters / 110540,
      lng + xMeters / (111320 * Math.cos(lat * Math.PI / 180)),
    ];
  }

  function geoDistanceMeters(aLat, aLng, bLat, bLng) {
    const x = (bLng - aLng) * 111320 * Math.cos((aLat + bLat) * Math.PI / 360);
    const y = (bLat - aLat) * 110540;
    return Math.hypot(x, y);
  }

  function makeProjection(rotation, pitch) {
    const centerLat = (BOUNDS.north + BOUNDS.south) / 2;
    const centerLng = (BOUNDS.west + BOUNDS.east) / 2;
    const angle = rotation * Math.PI / 180;
    const pitchRadians = pitch * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const depthScale = Math.sin(pitchRadians);
    const heightScale = Math.cos(pitchRadians);
    const metersPerLng = 111320 * Math.cos(centerLat * Math.PI / 180);
    const raw = (lat, lng) => {
      const x = (lng - centerLng) * metersPerLng;
      const y = (lat - centerLat) * 110540;
      return [x * cos - y * sin, -(x * sin + y * cos) * depthScale];
    };
    const corners = [
      raw(BOUNDS.south, BOUNDS.west),
      raw(BOUNDS.south, BOUNDS.east),
      raw(BOUNDS.north, BOUNDS.west),
      raw(BOUNDS.north, BOUNDS.east),
    ];
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const scale = Math.min(1050 / Math.max(1, spanX), 610 / Math.max(1, spanY));
    const offsetX = VIEW.centerX - ((Math.min(...xs) + Math.max(...xs)) / 2) * scale;
    const offsetY = VIEW.centerY - ((Math.min(...ys) + Math.max(...ys)) / 2) * scale;
    return (lat, lng, elevation = 0) => {
      const point = raw(lat, lng);
      return [
        point[0] * scale + offsetX,
        point[1] * scale + offsetY - elevation * scale * heightScale * 0.55,
      ];
    };
  }

  function pointsAttr(points) {
    return points.map((point) => `${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
  }

  function polygonPoints(project, poly, elevation = 0) {
    return pointsAttr(poly.map((point) => project(Number(point[0]), Number(point[1]), elevation)));
  }

  function pathForGeometry(project, geometry, elevation = 0) {
    return geometry.map((point, index) => {
      const p = project(Number(point.lat), Number(point.lon), elevation);
      return `${index ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    }).join(" ");
  }

  function clipGeometryRuns(geometry) {
    const runs = [];
    let current = [];
    for (const point of geometry) {
      if (inBounds(Number(point.lat), Number(point.lon), -0.00008)) {
        current.push(point);
      } else if (current.length) {
        if (current.length > 1) runs.push(current);
        current = [];
      }
    }
    if (current.length > 1) runs.push(current);
    return runs;
  }

  function geometryLengthMeters(geometry) {
    let length = 0;
    for (let index = 1; index < geometry.length; index += 1) {
      const a = geometry[index - 1];
      const b = geometry[index];
      const x = (Number(b.lon) - Number(a.lon)) * 111320 * Math.cos(Number(a.lat) * Math.PI / 180);
      const y = (Number(b.lat) - Number(a.lat)) * 110540;
      length += Math.hypot(x, y);
    }
    return length;
  }

  function polygonPath(project, poly, elevation = 0) {
    const points = poly.map((point) => {
      const lat = Number(point.lat ?? point[0]);
      const lon = Number(point.lon ?? point[1]);
      const p = project(lat, lon, elevation);
      return `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    });
    return `M${points.join(" L")} Z`;
  }

  function extrudePrism(project, poly, height, className = "campus-block context", label = "") {
    const ring = poly.length > 2
      && poly[0][0] === poly[poly.length - 1][0]
      && poly[0][1] === poly[poly.length - 1][1]
      ? poly.slice(0, -1)
      : poly;
    const closed = [...ring, ring[0]];
    const base = closed.map((point) => project(Number(point[0]), Number(point[1]), 0));
    const roof = closed.map((point) => project(Number(point[0]), Number(point[1]), height));
    const faces = [];
    for (let index = 0; index < base.length - 1; index += 1) {
      const fillClass = index % 2 ? "campus-block-side-a" : "campus-block-side-b";
      faces.push(`<polygon class="${className} ${fillClass}" points="${pointsAttr([base[index], base[index + 1], roof[index + 1], roof[index]])}" />`);
    }
    let minIndex = 0;
    let maxIndex = 0;
    for (let index = 1; index < roof.length; index += 1) {
      if (roof[index][0] < roof[minIndex][0]) minIndex = index;
      if (roof[index][0] > roof[maxIndex][0]) maxIndex = index;
    }
    const silhouetteEdges = [...new Set([minIndex, maxIndex])].map((index) => {
      const top = roof[index];
      const bottom = base[index];
      return `<line class="${className.replaceAll("campus-block", "campus-block-edge")}" x1="${top[0]}" y1="${top[1]}" x2="${bottom[0]}" y2="${bottom[1]}" />`;
    }).join("");
    return `<g data-building="${label}">${faces.join("")}${silhouetteEdges}<polygon class="${className} campus-block-roof" points="${pointsAttr(roof)}" /><polyline class="${className} campus-block-base" points="${pointsAttr(base)}" /></g>`;
  }

  function landmarkBuildingClass(name) {
    if (!LANDMARK_BY_NAME.has(name)) return "";
    return ` landmark ${LANDMARK_BY_NAME.get(name).kind}`;
  }

  function drawBuilding(project, building, selectedName) {
    if (!building.poly || building.poly.length < 4) return "";
    const center = polygonCentroid(building.poly);
    if (!inBounds(center[0], center[1])) return "";
    const height = clamp(Number(building.height) || (Number(building.levels) || 3) * 3.3, 5, 90);
    const landmark = LANDMARK_BY_NAME.has(building.name);
    const selected = building.name === selectedName;
    const className = `campus-block ${landmark ? "landmark" + landmarkBuildingClass(building.name) : "context"}${selected ? " selected" : ""}`;
    let markup = extrudePrism(project, building.poly, height, className, building.name || "Context building");
    const nodePoint = project(center[0], center[1], height + 1);
    markup += `<circle class="campus-building-node ${landmark ? "landmark" : ""}" data-building-node="${escapeXml(building.name || "")}" cx="${nodePoint[0].toFixed(1)}" cy="${nodePoint[1].toFixed(1)}" r="${landmark ? 3 : 2.2}"><title>${escapeXml(building.name || "University building")}</title></circle>`;
    return markup;
  }

  function drawGate(project, landmark, selectedName) {
    const point = project(landmark.lat, landmark.lng, 0);
    const cx = point[0];
    const baseY = point[1] + 2;
    const height = 28;
    const pillarWidth = 8;
    const halfGap = 15;
    const pillar = (x) => `<g class="campus-gate-detail">
      <polygon class="campus-gate-piece" points="${x - pillarWidth / 2},${baseY} ${x + pillarWidth / 2},${baseY} ${x + pillarWidth / 2},${baseY - height} ${x - pillarWidth / 2},${baseY - height}"/>
      <polygon class="campus-gate-piece" points="${x - pillarWidth / 2 - 2},${baseY - height} ${x + pillarWidth / 2 + 2},${baseY - height} ${x + pillarWidth / 2 + 1},${baseY - height - 4} ${x - pillarWidth / 2 - 1},${baseY - height - 4}"/>
    </g>`;
    const lintelY = baseY - height - 1;
    const markup = `
      ${pillar(cx - halfGap)}
      ${pillar(cx + halfGap)}
      <polygon class="campus-gate-piece" points="${cx - halfGap - 6},${lintelY} ${cx + halfGap + 6},${lintelY} ${cx + halfGap + 6},${lintelY - 5} ${cx - halfGap - 6},${lintelY - 5}"/>
      <circle class="campus-gate-piece" cx="${cx}" cy="${lintelY - 7}" r="3"/>`;
    return `<g class="campus-model-pin ${landmark.name === selectedName ? "active" : ""}" data-campus-landmark="${landmark.name}">
      ${markup}
    </g>`;
  }

  function drawAlmaMater(project, landmark, selectedName) {
    const base = project(landmark.lat, landmark.lng, 0);
    return `<g class="campus-model-pin ${landmark.name === selectedName ? "active" : ""}" data-campus-landmark="${landmark.name}">
      <polygon class="campus-gate-piece" points="${base[0] - 9},${base[1]} ${base[0] + 9},${base[1]} ${base[0] + 6},${base[1] - 7} ${base[0] - 6},${base[1] - 7}"/>
      <path class="campus-gate-detail" d="M${base[0] - 4} ${base[1] - 7}L${base[0] - 3} ${base[1] - 14}L${base[0] + 4} ${base[1] - 14}L${base[0] + 5} ${base[1] - 7}Z"/>
      <path class="campus-gate-detail" d="M${base[0] - 1} ${base[1] - 14}L${base[0] - 2} ${base[1] - 23}L${base[0] + 3} ${base[1] - 23}L${base[0] + 4} ${base[1] - 14}Z"/>
      <circle class="campus-gate-piece" cx="${base[0] + 0.5}" cy="${base[1] - 25}" r="2.2"/>
      <path class="campus-gate-detail" d="M${base[0] - 3} ${base[1] - 21}L${base[0] - 8} ${base[1] - 16}M${base[0] + 3} ${base[1] - 21}L${base[0] + 8} ${base[1] - 17}"/>
      <rect class="campus-gate-piece" x="${base[0] - 6}" y="${base[1] - 18}" width="5" height="3"/>
    </g>`;
  }

  function renderLandmarkRail(selectedName) {
    const root = document.querySelector("#campus-landmarks");
    if (!root) return;
    root.innerHTML = LANDMARKS.map((item, index) => `
      <button type="button" class="campus-landmark-btn ${item.name === selectedName ? "active" : ""}" data-campus-landmark="${item.name}">
        <span class="campus-landmark-index">${String(index + 1).padStart(2, "0")}</span>
        <span><b>${item.label}</b><small>${item.subtitle}</small></span>
      </button>`).join("");
    const selection = document.querySelector("#campus-model-selection");
    if (!selection) return;
    const active = LANDMARK_BY_NAME.get(selectedName);
    selection.innerHTML = active
      ? `<b>${active.label}</b><span>${active.description}</span>`
      : `<b>Columbia University</b><span>Drag to orbit · Shift-drag to pan · scroll to zoom · double-click to reset · hover a landmark to inspect it.</span>`;
  }

  function drawCoursePointers(project, centralBuildings) {
    const targets = window.CAMPUS_MODEL_COURSE_TARGETS || [];
    return targets.map((target, index) => {
      const alias = normalizeBuildingName(target.name);
      let match = centralBuildings.find((entry) => {
        const candidate = normalizeBuildingName(entry.building.name);
        return candidate === alias || candidate.includes(alias) || alias.includes(candidate);
      });
      if (!match) {
        let distance = Infinity;
        for (const entry of centralBuildings) {
          const current = geoDistanceMeters(target.lat, target.lng, entry.center[0], entry.center[1]);
          if (current < distance) {
            distance = current;
            match = entry;
          }
        }
        if (distance > 90) match = null;
      }
      const offCampus = !match;
      const lat = match?.center[0] ?? clamp(target.lat, BOUNDS.south + 0.0001, BOUNDS.north - 0.0001);
      const lng = match?.center[1] ?? clamp(target.lng, BOUNDS.west + 0.0001, BOUNDS.east - 0.0001);
      const height = offCampus ? 8 : (Number(match?.building.height) || 20);
      const top = project(lat, lng, height + 5);
      const label = (target.codes || []).slice(0, 2).join(" · ") || "Selected course";
      const width = Math.max(42, label.length * 5.2 + 12);
      return `<g class="campus-course-cursor ${offCampus ? "off-campus" : ""}" data-course-cursor="${index}">
        <circle class="course-cursor-pulse" cx="${top[0]}" cy="${top[1]}" r="10"/>
        <circle class="course-cursor-dot" cx="${top[0]}" cy="${top[1]}" r="3.8"/>
        <path class="course-cursor-stem" d="M${top[0]} ${top[1] + 5}v13l-3-4m3 4 3-4"/>
        <rect class="course-cursor-label-bg" x="${top[0] - width / 2}" y="${top[1] - 27}" width="${width}" height="14" rx="3"/>
        <text class="course-cursor-label" x="${top[0]}" y="${top[1] - 17.5}" text-anchor="middle">${label}</text>
        ${offCampus ? `<text class="course-cursor-destination" x="${top[0]}" y="${top[1] + 24}" text-anchor="middle">↑ ${escapeXml(target.name)}</text>` : ""}
      </g>`;
    }).join("");
  }

  function renderCampusModel(selectedName = MODEL_STATE.selected) {
    const host = document.querySelector("#campus-model-svg");
    const loading = document.querySelector("#map-loading");
    if (!host) return;
    const buildings = window.CAMPUS_3D?.buildings || [];
    const osm = window.CAMPUS_OSM?.elements || [];
    if (!buildings.length || !osm.length) {
      if (loading) loading.textContent = "Campus geometry is unavailable.";
      return;
    }
    MODEL_STATE.selected = selectedName || "";
    MODEL_STATE.built = true;
    const project = makeProjection(MODEL_STATE.rotation, MODEL_STATE.pitch);
    const universityWays = osm.filter((item) => item.type === "way" && item.tags?.landuse === "university" && item.geometry?.length > 2);
    const campusPolygons = universityWays.map((way) => way.geometry);
    const greenWays = osm.filter((item) => item.type === "way"
      && item.geometry?.length > 3
      && (item.tags?.landuse === "grass"
        || item.tags?.landuse === "recreation_ground"
        || item.tags?.landuse === "village_green"
        || item.tags?.leisure === "park"
        || item.tags?.leisure === "garden"
        || item.tags?.leisure === "pitch"
        || item.tags?.natural === "grass"
        || item.tags?.surface === "grass"));
    const roadWays = osm.filter((item) => {
      if (item.type !== "way" || !item.tags?.highway || !(item.geometry?.length > 1)) return false;
      const highway = item.tags.highway;
      if (!["primary", "secondary", "tertiary", "residential", "footway", "pedestrian", "steps", "path", "crossing"].includes(highway)) return false;
      const name = item.tags.name || "";
      if (["primary", "secondary", "tertiary", "residential"].includes(highway)) {
        return /Broadway|Amsterdam Avenue|West 11[4-9]th Street|West 120th Street/.test(name);
      }
      if (/College Walk|Low Library Steps|Reunion Plaza|Revson Plaza/i.test(name)) return true;
      const runs = clipGeometryRuns(item.geometry);
      return runs.some((run) => geometryLengthMeters(run) >= 55);
    }).sort((a, b) => {
      const named = (way) => /College Walk|Low Library Steps|Reunion Plaza|Revson Plaza/i.test(way.tags?.name || "") ? 2 : 0;
      const length = (way) => Math.max(0, ...clipGeometryRuns(way.geometry).map(geometryLengthMeters));
      return named(b) - named(a) || length(b) - length(a);
    }).slice(0, 34);
    const campusNames = new Set(
      (window.BUILDINGS || []).filter((building) => building.campus === "Morningside").map((building) => normalizeBuildingName(building.name)),
    );
    const heightByName = new Map(buildings.filter((building) => building.name).map((building) => [normalizeBuildingName(building.name), building.height]));
    const footprintsWithCenters = buildings
      .filter((building) => building.poly?.length > 2)
      .map((building) => ({ building, center: polygonCentroid(building.poly) }));
    const osmBuildings = osm
      .filter((item) => item.type === "way" && item.tags?.building && item.geometry?.length > 3)
      .map((item) => {
        const poly = item.geometry.map((point) => [point.lat, point.lon]);
        const center = polygonCentroid(poly);
        const name = item.tags.name || "University building";
        const buildingType = item.tags.building;
        const explicitHeight = Number.parseFloat(item.tags.height || "");
        const levelHeight = Number.parseFloat(item.tags["building:levels"] || "") * 3.25;
        let nearestHeight = null;
        let nearestDistance = Infinity;
        for (const candidate of footprintsWithCenters) {
          if (!candidate.building.height || !inBounds(candidate.center[0], candidate.center[1])) continue;
          const distance = geoDistanceMeters(center[0], center[1], candidate.center[0], candidate.center[1]);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestHeight = candidate.building.height;
          }
        }
        return { item, building: {
          name,
          height: heightByName.get(normalizeBuildingName(name))
            || (Number.isFinite(explicitHeight) ? explicitHeight : null)
            || (Number.isFinite(levelHeight) ? levelHeight : null)
            || (nearestDistance < 20 ? nearestHeight : null)
            || (buildingType === "university" ? 20 : buildingType === "dormitory" ? 28 : buildingType === "roof" ? 5 : 16),
          poly,
        }, center };
      })
      .filter((entry) => inBounds(entry.center[0], entry.center[1]))
      .filter((entry) => {
        const type = entry.item.tags.building;
        return campusPolygons.some((poly) => pointInPolygon(entry.center[0], entry.center[1], poly))
          || campusNames.has(normalizeBuildingName(entry.building.name))
          || ["university", "dormitory", "college"].includes(type);
      });
    const coveredNames = new Set(osmBuildings.map((entry) => normalizeBuildingName(entry.building.name)));
    const extraNamedFootprints = buildings
      .filter((building) => building.name && building.poly?.length > 3)
      .filter((building) => {
        const normalized = normalizeBuildingName(building.name);
        return LANDMARK_BY_NAME.has(building.name)
          || campusNames.has(normalized)
          || [...campusNames].some((name) => name && (normalized.includes(name) || name.includes(normalized)));
      })
      .filter((building) => !coveredNames.has(normalizeBuildingName(building.name)))
      .map((building) => ({ building, center: polygonCentroid(building.poly) }));
    const centralBuildings = [...osmBuildings, ...extraNamedFootprints]
      .map((entry) => ({ ...entry, depth: project(entry.center[0], entry.center[1], 0)[1] }))
      .sort((a, b) => a.depth - b.depth);
    const representedNames = new Set(centralBuildings.map((entry) => normalizeBuildingName(entry.building.name)));
    const usedFootprintIds = new Set(centralBuildings.map((entry) => entry.building.id).filter(Boolean));
    for (const target of (window.BUILDINGS || []).filter((building) => building.campus === "Morningside")) {
      if (representedNames.has(normalizeBuildingName(target.name))) continue;
      let nearest = null;
      let nearestDistance = Infinity;
      for (const candidate of buildings) {
        if (!candidate.poly?.length || usedFootprintIds.has(candidate.id)) continue;
        const center = polygonCentroid(candidate.poly);
        const distance = geoDistanceMeters(target.lat, target.lng, center[0], center[1]);
        if (distance < nearestDistance) {
          nearest = { building: { ...candidate, name: target.name, height: candidate.height || 22 }, center };
          nearestDistance = distance;
        }
      }
      if (nearest && nearestDistance < 65) {
        centralBuildings.push({ ...nearest, depth: project(nearest.center[0], nearest.center[1], 0)[1] });
        if (nearest.building.id) usedFootprintIds.add(nearest.building.id);
        representedNames.add(normalizeBuildingName(target.name));
      }
    }
    centralBuildings.sort((a, b) => a.depth - b.depth);

    const defs = `<defs>
      <filter id="campus-model-shadow" x="-20%" y="-30%" width="150%" height="170%">
        <feDropShadow dx="0" dy="13" stdDeviation="12" flood-color="#222" flood-opacity=".10"/>
      </filter>
      <pattern id="campus-paper-grid" width="22" height="22" patternUnits="userSpaceOnUse">
        <path d="M22 0H0V22" fill="none" stroke="#232321" stroke-opacity=".045" stroke-width=".7"/>
      </pattern>
      <pattern id="campus-grass-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <rect width="9" height="9" fill="#d7dfc8"/>
        <path d="M0 4.5H9" stroke="#aebda0" stroke-width="1" stroke-opacity=".48"/>
      </pattern>
    </defs>`;

    const plate = universityWays.map((way) => {
      const base = way.geometry.map((point) => project(point.lat, point.lon, 0));
      const low = way.geometry.map((point) => project(point.lat, point.lon, -8));
      const sides = [];
      for (let index = 0; index < base.length - 1; index += 1) {
        sides.push(`<polygon class="campus-plate-side" points="${pointsAttr([base[index], base[index + 1], low[index + 1], low[index]])}" />`);
      }
      return `<g filter="url(#campus-model-shadow)">${sides.join("")}<polygon class="campus-plate-top" points="${pointsAttr(base)}" /></g>`;
    }).join("");

    const greenMarkup = greenWays.map((way) => {
      const center = polygonCentroid(way.geometry.map((point) => [point.lat, point.lon]));
      if (!inBounds(center[0], center[1], 0.00008)) return "";
      const insideCampus = campusPolygons.some((poly) => pointInPolygon(center[0], center[1], poly));
      if (!insideCampus && way.tags?.landuse !== "grass" && way.tags?.natural !== "grass") return "";
      return `<path class="campus-green-area" d="${polygonPath(project, way.geometry)}" />`;
    }).join("");

    const roadRank = { primary: 6, secondary: 5, tertiary: 4, residential: 3, service: 2 };
    const roadMarkup = MODEL_STATE.roads ? roadWays.flatMap((way) => {
      const highway = way.tags?.highway || "";
      return clipGeometryRuns(way.geometry).map((geometry) => {
        const path = pathForGeometry(project, geometry);
        if (roadRank[highway]) {
          const width = roadRank[highway] + 1.2;
          const surfaceClass = ["primary", "secondary"].includes(highway) ? "road-major" : "road-cross";
          return `<path class="campus-road-casing" stroke-width="${width + 2}" d="${path}" /><path class="campus-road-surface ${surfaceClass}" stroke-width="${width}" d="${path}" />`;
        }
        return `<path class="campus-walk-line ${highway === "pedestrian" || way.tags?.name === "College Walk" ? "walk-primary" : ""} ${highway === "steps" ? "campus-walk-dash" : ""}" stroke-width="${highway === "pedestrian" ? 3.2 : 1.2}" d="${path}" />`;
      });
    }).join("") : "";

    const buildingMarkup = centralBuildings.map(({ building }) => drawBuilding(project, building, MODEL_STATE.selected)).join("");
    const gates = LANDMARKS.filter((item) => item.kind === "gate").map((item) => drawGate(project, item, MODEL_STATE.selected)).join("");
    const statue = LANDMARKS.find((item) => item.kind === "statue");
    const alma = statue ? drawAlmaMater(project, statue, MODEL_STATE.selected) : "";
    const labels = MODEL_STATE.labels ? LANDMARKS.map((item, landmarkIndex) => {
      let lat = item.lat;
      let lng = item.lng;
      if (!lat) {
        const building = buildings.find((candidate) => candidate.name === item.name);
        if (building) [lat, lng] = polygonCentroid(building.poly);
      }
      if (!lat) return "";
      const point = project(lat, lng, item.kind === "gate" ? 12 : 24);
      const markerY = point[1] - (item.kind === "gate" ? 28 : 16);
      return `<g class="campus-model-pin ${item.name === MODEL_STATE.selected ? "active" : ""}" data-campus-landmark="${item.name}">
        <circle class="pin-dot" cx="${point[0]}" cy="${markerY}" r="7"/>
        <text class="campus-pin-number" x="${point[0]}" y="${markerY + 2.5}" text-anchor="middle">${String(landmarkIndex + 1).padStart(2, "0")}</text>
      </g>`;
    }).join("") : "";
    const roadLabels = MODEL_STATE.labels ? [
      { name: "Broadway", at: [40.8087, -73.9641] },
      { name: "Amsterdam Ave", at: [40.8085, -73.95955] },
      { name: "College Walk", at: [40.80722, -73.96198] },
    ].map((label) => {
      const point = project(label.at[0], label.at[1], 1);
      return `<text class="campus-model-watermark" x="${point[0]}" y="${point[1]}" text-anchor="middle">${label.name}</text>`;
    }).join("") : "";

    host.innerHTML = `${defs}
      <rect width="${VIEW.width}" height="${VIEW.height}" fill="url(#campus-paper-grid)" opacity=".55"/>
      <g id="campus-model-camera">
        ${plate}
        <g id="campus-model-ground">${greenMarkup}</g>
        <g id="campus-model-roads">${roadMarkup}</g>
        <g id="campus-model-buildings">${buildingMarkup}${gates}${alma}</g>
        <g id="campus-model-labels">${labels}${roadLabels}</g>
        <g id="campus-model-course-pointers">${drawCoursePointers(project, centralBuildings)}</g>
      </g>`;
    applyCampusCamera();
    if (loading) loading.hidden = true;
    const fallback = document.querySelector("#map-fallback");
    if (fallback) fallback.hidden = true;
    renderLandmarkRail(MODEL_STATE.selected);
    const angleLabel = document.querySelector("#campus-model-angle");
    if (angleLabel) angleLabel.textContent = `AZ ${Math.round(MODEL_STATE.rotation)}° · EL ${Math.round(MODEL_STATE.pitch)}°`;
  }

  function applyCampusCamera() {
    const camera = document.querySelector("#campus-model-camera");
    if (!camera) return;
    const cx = VIEW.centerX;
    const cy = VIEW.centerY;
    camera.setAttribute("transform", `translate(${MODEL_STATE.panX} ${MODEL_STATE.panY}) translate(${cx} ${cy}) scale(${MODEL_STATE.zoom}) translate(${-cx} ${-cy})`);
  }

  function focusCampusModel(name) {
    const alias = String(name || "").toLowerCase();
    const exact = LANDMARKS.find((item) => item.name.toLowerCase() === alias || item.label.toLowerCase() === alias);
    const partial = LANDMARKS.find((item) => item.name.toLowerCase().includes(alias) || item.label.toLowerCase().includes(alias));
    const landmark = exact || partial || null;
    const building = window.CAMPUS_3D?.buildings.find((item) => item.name && item.name.toLowerCase().includes(alias));
    const selected = landmark?.name || building?.name || "";
    MODEL_STATE.selected = selected;
    MODEL_STATE.zoom = selected ? 1.6 : 1.45;
    MODEL_STATE.panX = 0;
    MODEL_STATE.panY = 0;
    renderCampusModel(selected);
    if (window.updateMapLinks) updateMapLinks(name || "Columbia University");
  }

  function bindCampusModelControls() {
    const showLandmarkNote = (node) => {
      if (node?.dataset.campusLandmark) {
        const item = LANDMARK_BY_NAME.get(node.dataset.campusLandmark);
        const selection = document.querySelector("#campus-model-selection");
        if (item && selection) selection.innerHTML = `<b>${item.label}</b><span>${item.description}</span>`;
      }
    };
    document.querySelector("#campus-landmarks")?.addEventListener("pointerover", (event) => {
      showLandmarkNote(event.target.closest("[data-campus-landmark]"));
    });
    document.querySelector("#campus-model-viewport")?.addEventListener("pointerover", (event) => {
      showLandmarkNote(event.target.closest("[data-campus-landmark]"));
    });
    document.querySelector("#campus-landmarks")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-campus-landmark]");
      if (button) focusCampusModel(button.dataset.campusLandmark);
    });
    document.querySelector("#campus-model-viewport")?.addEventListener("click", (event) => {
      if (MODEL_STATE.suppressClick) {
        MODEL_STATE.suppressClick = false;
        return;
      }
      const pin = event.target.closest("[data-campus-landmark]");
      if (pin) focusCampusModel(pin.dataset.campusLandmark);
      const buildingNode = event.target.closest("[data-building-node]");
      if (buildingNode?.dataset.buildingNode && !/^University building$/i.test(buildingNode.dataset.buildingNode)) {
        focusCampusModel(buildingNode.dataset.buildingNode);
      }
    });
    document.querySelectorAll("[data-model-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.modelToggle;
        MODEL_STATE[mode] = !MODEL_STATE[mode];
        button.classList.toggle("active", MODEL_STATE[mode]);
        renderCampusModel();
      });
    });
    document.querySelectorAll("[data-model-rotate]").forEach((button) => {
      button.addEventListener("click", () => {
        MODEL_STATE.rotation += Number(button.dataset.modelRotate);
        renderCampusModel();
      });
    });
    document.querySelector("[data-model-reset]")?.addEventListener("click", () => {
      MODEL_STATE.rotation = -38;
      MODEL_STATE.pitch = 58;
      MODEL_STATE.zoom = 1.45;
      MODEL_STATE.panX = 0;
      MODEL_STATE.panY = 0;
      MODEL_STATE.selected = "";
      renderCampusModel();
    });
    const svg = document.querySelector("#campus-model-svg");
    let orbitFrame = 0;
    const scheduleOrbitRender = () => {
      if (orbitFrame) return;
      orbitFrame = requestAnimationFrame(() => {
        orbitFrame = 0;
        renderCampusModel();
      });
    };
    svg?.addEventListener("wheel", (event) => {
      if (!event.target.closest("#campus-model-svg")) return;
      event.preventDefault();
      MODEL_STATE.zoom = clamp(MODEL_STATE.zoom * (event.deltaY < 0 ? 1.08 : 0.92), 0.65, 2.8);
      applyCampusCamera();
    }, { passive: false });
    svg?.addEventListener("pointerdown", (event) => {
      if (event.target.closest("[data-campus-landmark]")) return;
      if (event.button !== 0 && event.button !== 2) return;
      if (event.button === 2) event.preventDefault();
      MODEL_STATE.dragging = true;
      MODEL_STATE.dragMode = event.button === 2 || event.shiftKey ? "pan" : "orbit";
      MODEL_STATE.dragStart = {
        x: event.clientX,
        y: event.clientY,
        panX: MODEL_STATE.panX,
        panY: MODEL_STATE.panY,
        rotation: MODEL_STATE.rotation,
        pitch: MODEL_STATE.pitch,
        moved: false,
      };
      svg.classList.add("dragging");
      svg.setPointerCapture?.(event.pointerId);
    });
    svg?.addEventListener("pointermove", (event) => {
      if (!MODEL_STATE.dragging || !MODEL_STATE.dragStart) return;
      const dx = event.clientX - MODEL_STATE.dragStart.x;
      const dy = event.clientY - MODEL_STATE.dragStart.y;
      if (Math.hypot(dx, dy) > 3) MODEL_STATE.dragStart.moved = true;
      if (MODEL_STATE.dragMode === "pan") {
        MODEL_STATE.panX = MODEL_STATE.dragStart.panX + dx;
        MODEL_STATE.panY = MODEL_STATE.dragStart.panY + dy;
        applyCampusCamera();
      } else {
        MODEL_STATE.rotation = MODEL_STATE.dragStart.rotation + dx * 0.34;
        MODEL_STATE.pitch = clamp(MODEL_STATE.dragStart.pitch - dy * 0.24, 35, 75);
        scheduleOrbitRender();
      }
    });
    const releasePointer = () => {
      if (MODEL_STATE.dragStart?.moved) {
        MODEL_STATE.suppressClick = true;
        setTimeout(() => { MODEL_STATE.suppressClick = false; }, 120);
      }
      MODEL_STATE.dragging = false;
      MODEL_STATE.dragStart = null;
      MODEL_STATE.dragMode = "";
      svg?.classList.remove("dragging");
    };
    svg?.addEventListener("pointerup", releasePointer);
    svg?.addEventListener("pointercancel", releasePointer);
    svg?.addEventListener("contextmenu", (event) => event.preventDefault());
    svg?.addEventListener("dblclick", () => {
      MODEL_STATE.rotation = -38;
      MODEL_STATE.pitch = 58;
      MODEL_STATE.zoom = 1.45;
      MODEL_STATE.panX = 0;
      MODEL_STATE.panY = 0;
      renderCampusModel();
    });
  }

  window.renderCampusModel = renderCampusModel;
  window.focusCampusModel = focusCampusModel;
  window.updateCampusCourseTargets = (targets = []) => {
    window.CAMPUS_MODEL_COURSE_TARGETS = Array.isArray(targets) ? targets : [];
    if (MODEL_STATE.built) renderCampusModel();
  };
  bindCampusModelControls();
  renderCampusModel();
  window.CAMPUS_MODEL_INITIALIZED = true;
})();
