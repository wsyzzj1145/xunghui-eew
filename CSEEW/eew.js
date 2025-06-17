// 定义初始地图状态
const INITIAL_MAP_CENTER = [104.06, 30.67]; // 成都
const INITIAL_MAP_ZOOM = 5;

// 定义烈度配色
const intColor = {
    "0": {
        "bkcolor": "#444444"
    },
    "1": {
        "bkcolor": "#9bc4e4"
    },
    "2": {
        "bkcolor": "#00a0f1"
    },
    "3": {
        "bkcolor": "#0062f5"
    },
    "4": {
        "bkcolor": "#2de161"
    },
    "5": {
        "bkcolor": "#1cac5d"
    },
    "6": {
        "bkcolor": "#ffbd2b"
    },
    "7": {
        "bkcolor": "#ff992b"
    },
    "8": {
        "bkcolor": "#fa5151"
    },
    "9": {
        "bkcolor": "#f4440d"
    },
    "10": {
        "bkcolor": "#ff000d"
    },
    "11": {
        "bkcolor": "#c20007"
    },
    "12": {
        "bkcolor": "#fd2fc2"
    }
};

// Data sources
const eewSources = [
    'https://api.wolfx.jp/sc_eew.json',
    'https://api.wolfx.jp/fj_eew.json',
    'https://api.wolfx.jp/jma_eew.json',
    'https://api.wolfx.jp/cwa_eew.json'
];

const eqListSources = [
    'https://api.wolfx.jp/cenc_eqlist.json' // 只保留中国地震台网的数据源
];

/**
 * 通用数据抓取函数
 * @param {string} url - API的URL
 * @returns {Promise<Object|null>} 抓取到的JSON数据或null（如果出错）
 */
async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status} from ${url}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`Fetched data successfully from ${url}:`, data); // Log successful fetch
        return data;
    } catch (error) {
        console.error(`Error fetching data from ${url}:`, error);
        return null;
    }
}

/**
 * 估算地震烈度 I0
 * 公式: I0 = 1.5 * M + 3.0 - 3.5 * log10(h)
 * @param {number} magnitude - 震级 (M)
 * @param {number} depth - 深度 (h, 单位: km)
 * @returns {number} 估算的烈度，四舍五入到整数，并限制在0到12之间
 */
function estimateIntensity(magnitude, depth) {
    // 输入验证: 确保震级 M >= 3.0 (公式适用于破坏性地震)
    if (isNaN(magnitude) || magnitude < 3.0) {
        return 0;
    }

    let actualDepth = parseFloat(depth);
    // 确保深度为正数，避免log10(0)或负数。如果无效或为0，默认为10km。
    if (isNaN(actualDepth) || actualDepth <= 0) {
        actualDepth = 10;
    }

    // 计算 log10(h)
    const logDepth = Math.log10(actualDepth);

    // 应用新的公式
    let estimatedI = (1.5 * magnitude) + 3.0 - (3.5 * logDepth);

    // 四舍五入到最近的整数
    estimatedI = Math.round(estimatedI);

    // 限制烈度在 0 到 12 之间 (通常为 Ⅰ~Ⅻ 度)
    return Math.max(0, Math.min(12, estimatedI));
}


// 等待 DOMContentLoaded 事件触发，确保所有 HTML 元素都已加载
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the map
    const map = new AMap.Map('map-container', {
        zoom: INITIAL_MAP_ZOOM,
        center: INITIAL_MAP_CENTER,
        viewMode: '3D',
        mapStyle: 'amap://styles/grey' // 将地图样式设置为幻影黑
    });

    const eqList = document.getElementById('eq-list');
    const testEewBtn = document.getElementById('test-eew-btn');

    // 获取预警栏的父容器
    const eewAlertsContainer = document.getElementById('eew-alerts-container');

    // 用于存储当前活跃的EEW预警实例 (EventID -> { element, timeoutId })
    const activeEewAlerts = new Map();

    // 用于存储当前活跃的地震波实例 (EventID -> { epicenter, pWave, sWave, animationFrameId, lastUpdateTime, fitViewTimer })
    const activeWaveAnimations = new Map();

    // 定义预警栏和地震波的显示持续时间（10分钟）
    const ALERT_DISPLAY_DURATION_MS = 10 * 60 * 1000; // 10分钟 (600,000毫秒)


    /**
     * 显示地震列表（例如历史地震）
     * @param {Object} data - 地震列表数据
     * @param {string} dataType - 数据的类型，例如 'cenc_eqlist' 或 'jma_eqlist'
     */
    function displayEqList(data, dataType) {
        console.log("Attempting to display earthquake list. Received data:", data, "with type:", dataType);

        if (!data) {
            console.warn("No data received for earthquake list, skipping display.");
            return;
        }

        if (!eqList) {
            console.error("eqList DOM element not found!");
            return;
        }

        // 清空现有列表以避免重复
        eqList.innerHTML = '';

        if (dataType === 'cenc_eqlist') {
            console.log("Processing cenc_eqlist data.");
            for (let i = 1; i <= 50; i++) {
                const eq = data[`No${i}`];
                if (eq) {
                    const listItem = document.createElement('li');
                    // 估算烈度
                    const estimatedIntensity = estimateIntensity(parseFloat(eq.magnitude), parseFloat(eq.depth));
                    const intensityBgColor = intColor[estimatedIntensity] ? intColor[estimatedIntensity].bkcolor : intColor["0"].bkcolor;

                    listItem.innerHTML = `
                        <div class="eq-intensity-small" style="background-color: ${intensityBgColor};">${estimatedIntensity}</div>
                        <div class="eq-details-small">
                            <div class="eq-location-small">${eq.location}</div>
                            <div><span class="eq-magnitude-small">M${eq.magnitude}</span> <span class="eq-depth-small">${eq.depth}km</span></div>
                            <div class="eq-time-small">${eq.time}</div>
                        </div>
                    `;
                    eqList.appendChild(listItem);
                }
            }
        } else if (dataType === 'jma_eqlist') {
            console.log("Processing jma_eqlist data.");
            for (let i = 1; i <= 50; i++) {
                const eq = data[`No${i}`];
                if (eq) {
                    const listItem = document.createElement('li');
                    // 使用JMA提供的Shindo（震度）作为烈度，如果不存在则估算
                    let displayIntensity = '-';
                    let rawMagnitudeForCalc = parseFloat(eq.magnitude);
                    let rawDepthForCalc = parseFloat(eq.depth);

                    if (eq.shindo && eq.shindo !== '-') {
                        displayIntensity = eq.shindo.replace('+', '').replace('-', '');
                    } else if (!isNaN(rawMagnitudeForCalc) && !isNaN(rawDepthForCalc)) {
                        displayIntensity = estimateIntensity(rawMagnitudeForCalc, rawDepthForCalc);
                    }

                    // 根据烈度值获取背景颜色
                    let intensityBgColor = intColor["0"].bkcolor;
                    if (displayIntensity !== '-' && intColor[displayIntensity] && intColor[displayIntensity].bkcolor) {
                        intensityBgColor = intColor[displayIntensity].bkcolor;
                    }

                    listItem.innerHTML = `
                        <div class="eq-intensity-small" style="background-color: ${intensityBgColor};">${displayIntensity}</div>
                        <div class="eq-details-small">
                            <div class="eq-location-small">${eq.location}</div>
                            <div><span class="eq-magnitude-small">M${eq.magnitude}</span> <span class="eq-depth-small">${eq.depth}km</span></div>
                            <div class="eq-time-small">${eq.time}</div>
                        </div>
                    `;
                    eqList.appendChild(listItem);
                }
            }
        } else {
            console.warn("Unknown or unexpected earthquake list data type:", dataType, data);
        }
    }

    /**
     * 创建并显示一个新的地震预警栏DOM元素
     * @param {Object} data 预警数据
     * @returns {HTMLElement} 新创建的预警栏元素
    */
    function createEewAlertElement(data) {
        const alertItem = document.createElement('div');
        alertItem.className = 'eew-alert-item';
        // 使用EventID、ID或随机生成ID作为唯一标识，用于管理预警栏
        alertItem.setAttribute('data-event-id', data.EventID || data.ID || `test-${Date.now()}-${Math.random().toString(36).substring(7)}`);

        // 填充内容变量
        let reportNum = '';
        let hypoCenter = '';
        let originTime = '';
        let magnitudeDisplay = ''; // 用于显示的震级字符串
        let depthDisplay = '';       // 用于显示的深度字符串
        let maxIntensityDisplay = '-'; // 用于显示的最大烈度（可能是估算值或API提供值）
        let sourceAgency = '未知机构';

        // 用于烈度计算的原始数值
        let rawMagnitudeForCalc = null;
        let rawDepthForCalc = null;

        // 根据数据类型解析字段并确定发布机构
        if (data.type === 'sc_eew') {
            reportNum = data.ReportNum;
            hypoCenter = data.HypoCenter;
            originTime = data.OriginTime;
            magnitudeDisplay = data.Magunitude;
            rawMagnitudeForCalc = parseFloat(data.Magunitude);
            depthDisplay = data.Depth;
            rawDepthForCalc = parseFloat(data.Depth);
            sourceAgency = '四川地震局';
            maxIntensityDisplay = data.MaxIntensity; // 优先使用API提供的
        } else if (data.type === 'fj_eew') {
            reportNum = data.ReportNum;
            hypoCenter = data.HypoCenter;
            originTime = data.OriginTime;
            magnitudeDisplay = data.Magunitude;
            rawMagnitudeForCalc = parseFloat(data.Magunitude);
            depthDisplay = '未知深度'; // fj_eew API不提供深度，这里明确标识
            rawDepthForCalc = 10; // 默认深度用于计算（如果API未提供）
            maxIntensityDisplay = 'N/A'; // API未提供
            sourceAgency = '福建地震局';
        } else if (data.type === 'cwa_eew') {
            reportNum = data.ReportNum;
            hypoCenter = data.HypoCenter;
            originTime = data.OriginTime;
            magnitudeDisplay = data.Magunitude;
            rawMagnitudeForCalc = parseFloat(data.Magunitude);
            depthDisplay = data.Depth;
            rawDepthForCalc = parseFloat(data.Depth);
            sourceAgency = '台湾中央气象署';
            maxIntensityDisplay = data.MaxIntensity; // 优先使用API提供的
        } else if (data.type === 'jma_eew') {
            reportNum = data.Serial;
            hypoCenter = data.Hypocenter;
            originTime = data.OriginTime;
            magnitudeDisplay = data.Magunitude;
            rawMagnitudeForCalc = parseFloat(data.Magunitude);
            depthDisplay = data.Depth;
            rawDepthForCalc = parseFloat(data.Depth);
            sourceAgency = data.Issue?.Source || '日本气象厅';
            maxIntensityDisplay = data.MaxIntensity; // 优先使用API提供的
        } else if (data.type === 'test_eew') { // 专门处理测试数据
            reportNum = data.ReportNum || data.Serial;
            hypoCenter = data.HypoCenter || data.Hypocenter;
            originTime = data.OriginTime;
            magnitudeDisplay = data.Magunitude;
            rawMagnitudeForCalc = parseFloat(data.Magunitude);
            depthDisplay = data.Depth;
            rawDepthForCalc = parseFloat(data.Depth);
            maxIntensityDisplay = data.MaxIntensity; // 优先使用测试数据自带的烈度
            sourceAgency = `${data.name || '测试'}模拟机构`;
        }

        // 如果可以计算，则使用估算烈度，否则使用API提供的或默认值
        // 即使API提供了MaxIntensity，我们也优先尝试用公式计算，除非数据不满足计算条件。
        if (!isNaN(rawMagnitudeForCalc) && !isNaN(rawDepthForCalc)) {
            maxIntensityDisplay = estimateIntensity(rawMagnitudeForCalc, rawDepthForCalc);
        } else {
            // 如果API的MaxIntensity为"N/A"或未定义，则显示'-'
            if (maxIntensityDisplay === 'N/A' || maxIntensityDisplay === undefined || maxIntensityDisplay === null) {
                maxIntensityDisplay = '-';
            }
        }

        // 根据烈度值获取背景颜色
        let intensityBgColor = intColor["0"].bkcolor; // 默认颜色，对应0度或无法计算
        if (maxIntensityDisplay !== '-' && intColor[maxIntensityDisplay] && intColor[maxIntensityDisplay].bkcolor) {
            intensityBgColor = intColor[maxIntensityDisplay].bkcolor;
        }

        // 构建预警栏的HTML内容
        alertItem.innerHTML = `
            <div class="eew-header">
                <span class="eew-icon">⚠️</span> 地震预警 <span class="eew-report-num">${reportNum ? `(第${reportNum}报)` : '(报数未知)'}</span>
            </div>
            <div class="eew-content">
                <div class="eew-intensity" style="background-color: ${intensityBgColor};">${maxIntensityDisplay}</div>
                <div class="eew-details">
                    <div class="eew-location">${hypoCenter || '未知地点'}</div>
                    <div class="eew-agency">发布机构: ${sourceAgency}</div>
                    <div class="eew-time">${originTime || '未知时间'} 发生</div>
                    <div><span class="eew-magnitude">M${magnitudeDisplay}</span> <span class="eew-depth">${depthDisplay ? `${depthDisplay}km` : '深度未知'}</span></div>
                </div>
            </div>
        `;

        eewAlertsContainer.appendChild(alertItem);
        return alertItem;
    }


    /**
     * 显示或更新地震预警信息和地图动画
     * @param {Object} data 原始的地震预警数据
     */
    function displayEew(data) {
        // 检查是否为取消报或最终报 (JMA特有 isCancel, fj_eew/jma_eew isFinal)
        const isCancel = data && data.type === 'jma_eew' && data.isCancel === true;
        const isFinal = data && (
            (data.type === 'jma_eew' && data.isFinal === true) ||
            (data.type === 'fj_eew' && data.isFinal === true)
        );

        // 获取唯一事件ID
        // 为测试预警生成一个唯一ID，以便它也能被Map正确管理
        const eventId = data.EventID || data.ID || `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        // 如果是取消报或最终报，并且存在对应的预警栏，则隐藏并移除它
        if (isCancel || isFinal) {
            if (activeEewAlerts.has(eventId)) {
                const { element, timeoutId } = activeEewAlerts.get(eventId);
                clearTimeout(timeoutId); // 清除自动隐藏定时器
                element.classList.add('hidden'); // 添加隐藏class，触发CSS过渡效果
                // 等待过渡动画完成再移除元素
                element.addEventListener('transitionend', () => {
                    element.remove();
                }, { once: true });
                activeEewAlerts.delete(eventId); // 从map中移除记录
            }
            // 同时停止并移除对应的地震波动画
            if (activeWaveAnimations.has(eventId)) {
                const { epicenter, pWave, sWave, animationFrameId, fitViewTimer } = activeWaveAnimations.get(eventId);
                cancelAnimationFrame(animationFrameId); // 取消动画帧
                if (fitViewTimer) clearTimeout(fitViewTimer); // 清除fitView定时器
                map.remove([epicenter, pWave, sWave]);
                activeWaveAnimations.delete(eventId);
                // 在波动画结束时恢复地图初始状态
                map.setZoom(INITIAL_MAP_ZOOM);
                map.setCenter(INITIAL_MAP_CENTER);
            }
            return; // 结束函数执行
        }

        let lat, lon, magnitude;

        // 根据数据源类型解析经纬度和震级
        if (data.type === 'sc_eew' || data.type === 'fj_eew' || data.type === 'cwa_eew' || data.type === 'test_eew') {
            lat = parseFloat(data.Latitude);
            lon = parseFloat(data.Longitude);
            magnitude = parseFloat(data.Magunitude);
        } else if (data.type === 'jma_eew') {
            lat = parseFloat(data.Latitude);
            lon = parseFloat(data.Longitude);
            magnitude = parseFloat(data.Magunitude);
        }

        // 只有当有有效的经纬度和震级时才显示预警
        if (lat && lon && magnitude && !isNaN(lat) && !isNaN(lon) && !isNaN(magnitude)) {
            let alertElement;
            // 检查是否已经存在该EventID的预警栏（即是否为更新报）
            if (activeEewAlerts.has(eventId)) {
                // 如果存在，更新其内容并重置定时器
                const existingAlert = activeEewAlerts.get(eventId);
                alertElement = existingAlert.element;
                clearTimeout(existingAlert.timeoutId); // 清除旧的定时器

                // 通过重新设置 innerHTML 来更新所有内容，包括发布机构和估算烈度
                const tempDiv = document.createElement('div');
                // 调用 createEewAlertElement 来生成最新的HTML内容
                tempDiv.innerHTML = createEewAlertElement(data).innerHTML;
                alertElement.innerHTML = tempDiv.innerHTML; // 更新现有元素的内部HTML
                alertElement.classList.remove('hidden'); // 确保可见
            } else {
                // 如果不存在，创建新的预警栏
                alertElement = createEewAlertElement(data);
            }

            // 为该预警栏设置自动隐藏定时器
            const newTimeoutId = setTimeout(() => {
                alertElement.classList.add('hidden'); // 添加隐藏class
                // 等待过渡动画完成再移除元素
                alertElement.addEventListener('transitionend', () => {
                    alertElement.remove();
                }, { once: true });
                activeEewAlerts.delete(eventId); // 从map中移除记录
            }, ALERT_DISPLAY_DURATION_MS);

            activeEewAlerts.set(eventId, { element: alertElement, timeoutId: newTimeoutId });

            // 触发或更新地震波动画
            addEarthquake(lat, lon, magnitude, eventId);

        } else {
            // 如果数据无效，且没有被取消/最终报处理过，则不作任何操作，
            // 现有的预警栏会等待各自的定时器到期或被新的有效预警覆盖。
            console.log(`Received invalid EEW data or no active EEW for EventID ${eventId}:`, data);
        }
    }

    /**
     * 启动或更新地震波动画
     * @param {number} lat 纬度
     * @param {number} lon 经度
     * @param {number} magnitude 震级
     * @param {string} eventId 预警事件ID，用于关联动画和预警栏
     */
    function addEarthquake(lat, lon, magnitude, eventId) {
        // 检查是否已经存在该EventID的地震波动画
        if (activeWaveAnimations.has(eventId)) {
            const existingAnimation = activeWaveAnimations.get(eventId);
            cancelAnimationFrame(existingAnimation.animationFrameId); // 取消旧的动画帧
            if (existingAnimation.fitViewTimer) clearTimeout(existingAnimation.fitViewTimer); // 清除旧的fitView定时器
            map.remove([existingAnimation.epicenter, existingAnimation.pWave, existingAnimation.sWave]); // 移除旧的地图元素
            activeWaveAnimations.delete(eventId); // 从map中删除旧记录
        }

        // Set map center and a closer initial zoom for the epicenter
        map.setCenter([lon, lat]);
        map.setZoom(8); // 初始缩放级别，比默认的5更近一些

        // Add a marker for the epicenter with a custom icon from the local 'img' folder
        const epicenter = new AMap.Marker({
            position: [lon, lat],
            icon: new AMap.Icon({
                image: 'img/epicenter.png', // 确保您的 img 文件夹中有 epicenter.png
                size: new AMap.Size(32, 32),
                imageSize: new AMap.Size(32, 32)
            }),
            anchor: 'center',
            title: `Magnitude ${magnitude}`
        });
        map.add(epicenter);

        // Simulate P and S waves
        const pWave = new AMap.Circle({
            center: [lon, lat],
            radius: 0,
            strokeColor: "#00B294", // P-wave color (青绿色)
            strokeOpacity: 0.8,      // 初始描边透明度
            strokeWeight: 2,
            fillColor: "#00B294",    // P-wave 填充颜色
            fillOpacity: 0.1         // 初始填充透明度
        });

        const sWave = new AMap.Circle({
            center: [lon, lat],
            radius: 0,
            strokeColor: "#F7630C", // S-wave color (橙色)
            strokeOpacity: 1,        // 初始描边透明度
            strokeWeight: 2,
            fillColor: "#F7630C",    // S-wave 填充颜色
            fillOpacity: 0.2         // 初始填充透明度
        });

        map.add(pWave);
        map.add(sWave);

        let pWaveRadius = 0;
        let sWaveRadius = 0;

        const pWaveSpeed_m_s = 6000; // P-wave speed: 6 km/s = 6000 m/s
        const sWaveSpeed_m_s = 4000; // S-wave speed: 4 km/s = 4000 m/s

        // 波纹最大扩散距离 (例如，持续动画10分钟)
        const maxAnimationDuration_s = ALERT_DISPLAY_DURATION_MS / 1000;
        const pWaveMaxRadius = pWaveSpeed_m_s * maxAnimationDuration_s;
        const sWaveMaxRadius = sWaveSpeed_m_s * maxAnimationDuration_s;

        let lastUpdateTime = performance.now();
        let fitViewTimer = null; // 用于控制 setFitView 的频率

        const animateWaves = (currentTime) => {
            const deltaTime = (currentTime - lastUpdateTime) / 1000; // Time in seconds
            lastUpdateTime = currentTime;

            // 根据时间差更新半径
            pWaveRadius += pWaveSpeed_m_s * deltaTime;
            sWaveRadius += sWaveSpeed_m_s * deltaTime;

            // 限制半径不超过最大值
            pWaveRadius = Math.min(pWaveRadius, pWaveMaxRadius);
            sWaveRadius = Math.min(sWaveRadius, sWaveMaxRadius);

            // 根据当前半径占总最大距离的比例来调整透明度，模拟衰减
            // 确保透明度不会低于0
            let currentPWaveStrokeOpacity = 0.8 * (1 - (pWaveRadius / pWaveMaxRadius));
            let currentPWaveFillOpacity = 0.1 * (1 - (pWaveRadius / pWaveMaxRadius));

            let currentSWaveStrokeOpacity = 1 * (1 - (sWaveRadius / sWaveMaxRadius));
            let currentSWaveFillOpacity = 0.2 * (1 - (sWaveRadius / sWaveMaxRadius));

            currentPWaveStrokeOpacity = Math.max(0, currentPWaveStrokeOpacity);
            currentPWaveFillOpacity = Math.max(0, currentPWaveFillOpacity);
            currentSWaveStrokeOpacity = Math.max(0, currentSWaveStrokeOpacity);
            currentSWaveFillOpacity = Math.max(0, currentSWaveFillOpacity);

            pWave.setRadius(pWaveRadius);
            sWave.setRadius(sWaveRadius);

            pWave.setOptions({
                strokeOpacity: currentPWaveStrokeOpacity,
                fillOpacity: currentPWaveFillOpacity
            });
            sWave.setOptions({
                strokeOpacity: currentSWaveStrokeOpacity,
                fillOpacity: currentSWaveFillOpacity
            });

            // 优化 setFitView 的调用频率
            // 只有当 fitViewTimer 为空时才设置新的定时器，确保每 500ms 最多调用一次
            if (!fitViewTimer) {
                fitViewTimer = setTimeout(() => {
                    const pBounds = pWave.getBounds();
                    const sBounds = sWave.getBounds();

                    let combinedBounds = null;
                    // 只有当至少一个波的边界存在时才进行视野调整
                    if (pBounds && sBounds) {
                        combinedBounds = pBounds.union(sBounds);
                    } else if (pBounds) {
                        combinedBounds = pBounds;
                    } else if (sBounds) {
                        combinedBounds = sBounds;
                    }

                    if (combinedBounds) {
                        // 将所有相关地图元素放入数组，让setFitView自动计算最佳视野
                        map.setFitView([epicenter, pWave, sWave], false, [100, 100, 100, 100]);
                    }
                    fitViewTimer = null; // 重置定时器
                }, 500); // 每 500ms 调整一次视野，可以根据需要调整
            }

            // 当P波和S波都扩散到其各自的最大距离时，停止动画并移除地图元素
            if (pWaveRadius < pWaveMaxRadius || sWaveRadius < sWaveMaxRadius) {
                // 继续动画
                activeWaveAnimations.get(eventId).animationFrameId = requestAnimationFrame(animateWaves);
            } else {
                // 动画结束
                if (fitViewTimer) clearTimeout(fitViewTimer); // 清除任何悬而未决的fitView定时器
                map.remove([epicenter, pWave, sWave]);
                activeWaveAnimations.delete(eventId); // 从map中移除记录

                // 恢复地图到初始状态
                map.setZoom(INITIAL_MAP_ZOOM);
                map.setCenter(INITIAL_MAP_CENTER);
                console.log(`Wave animation ended for EventID: ${eventId}. Map reset to initial state.`);
            }
        };

        // 启动动画
        const animationFrameId = requestAnimationFrame(animateWaves);

        // 将新的动画实例添加到 map 中，包括 animationFrameId 和 fitViewTimer
        activeWaveAnimations.set(eventId, { epicenter, pWave, sWave, animationFrameId, lastUpdateTime, fitViewTimer });
    }


    // --- Functionality for the Test EEW Button ---
    if (testEewBtn) { // Add a check to ensure button exists
        testEewBtn.addEventListener('click', () => {
            // 模拟地震事件，包含不同机构的模拟数据
            const testLocations = [
                { name: 'Sichuan', Latitude: 31.0, Longitude: 103.0, Magunitude: 6.8, ReportNum: Math.floor(Math.random() * 10) + 1, OriginTime: '2025/06/15 08:00:00', HypoCenter: '四川省阿坝州', Depth: 20, MaxIntensity: '7', type: 'sc_eew' },
                { name: 'Fujian', Latitude: 25.0, Longitude: 119.0, Magunitude: 5.5, ReportNum: Math.floor(Math.random() * 10) + 1, OriginTime: '2025/06/15 09:15:30', HypoCenter: '福建省泉州市', Depth: 15, MaxIntensity: '5', type: 'fj_eew' },
                { name: 'Taiwan Strait', Latitude: 23.5, Longitude: 118.5, Magunitude: 7.1, ReportNum: Math.floor(Math.random() * 10) + 1, OriginTime: '2025/06/15 10:30:45', HypoCenter: '台湾海峡', Depth: 30, MaxIntensity: '8', type: 'cwa_eew' },
                { name: 'Offshore Japan', Latitude: 36.0, Longitude: 141.0, Magunitude: 7.3, Serial: Math.floor(Math.random() * 10) + 1, AnnouncedTime: '2025/06/15 11:45:00', OriginTime: '2025/06/15 11:44:00', Hypocenter: '日本福岛县近海', Depth: 40, MaxIntensity: '6', type: 'jma_eew', Issue: { Source: '日本气象厅' } }
            ];

            const randomLocation = testLocations[Math.floor(Math.random() * testLocations.length)];

            const testEewData = {
                // ...randomLocation 展开了所有模拟数据
                ...randomLocation,
                // 为测试数据确保有一个唯一的 EventID，以便被系统正确追踪和管理
                EventID: `test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            };

            console.log("Triggering Test EEW:", testEewData);
            displayEew(testEewData);
        });
    } else {
        console.warn("Test EEW button (#test-eew-btn) not found. Test functionality will not be available.");
    }
    // ---------------------------------------------


    // Initial data load - 页面加载时首次获取并显示数据
    eqListSources.forEach(url => {
        fetchData(url).then(data => {
            if (data) {
                let dataType;
                if (url.includes('cenc_eqlist')) {
                    dataType = 'cenc_eqlist';
                } else if (url.includes('jma_eqlist')) { // This case might not be hit if only cenc_eqlist is in sources
                    dataType = 'jma_eqlist';
                }
                displayEqList(data, dataType);
            }
        });
    });

    eewSources.forEach(url => fetchData(url).then(displayEew));

    // Periodically refresh data - 每隔5秒钟刷新数据
    setInterval(async () => {
        // 同时请求所有EEW数据源
        const eewDataPromises = eewSources.map(url => fetchData(url));
        const eewResults = await Promise.all(eewDataPromises);

        // 追踪本次刷新中收到的所有有效EventID
        const receivedEventIdsThisCycle = new Set();

        for (const data of eewResults) {
            if (data && (data.EventID || data.ID || data.Serial)) {
                receivedEventIdsThisCycle.add(data.EventID || data.ID || data.Serial);
                displayEew(data);
            }
        }

        // 检查并清除已过期的EEW预警栏和动画
        activeEewAlerts.forEach((value, eventId) => {
            // 如果一个活跃的预警ID在本次刷新中没有收到，并且它不是测试警报，则将其视为过期并隐藏/移除
            // 对于测试警报，它们由自身的定时器管理，不在这里干预
            const isTestAlert = eventId.startsWith('test-');
            if (!receivedEventIdsThisCycle.has(eventId) && !isTestAlert) {
                clearTimeout(value.timeoutId);
                value.element.classList.add('hidden');
                value.element.addEventListener('transitionend', () => {
                    value.element.remove();
                }, { once: true });
                activeEewAlerts.delete(eventId);

                // 同样处理对应的地震波动画
                if (activeWaveAnimations.has(eventId)) {
                    const { epicenter, pWave, sWave, animationFrameId, fitViewTimer } = activeWaveAnimations.get(eventId);
                    cancelAnimationFrame(animationFrameId);
                    if (fitViewTimer) clearTimeout(fitViewTimer);
                    map.remove([epicenter, pWave, sWave]);
                    activeWaveAnimations.delete(eventId);
                    // 恢复地图到初始状态
                    map.setZoom(INITIAL_MAP_ZOOM);
                    map.setCenter(INITIAL_MAP_CENTER);
                }
            }
        });

        // 刷新地震列表（每次都清空并重新加载最新的数据）
        eqListSources.forEach(url => {
            fetchData(url).then(data => {
                if (data) {
                    let dataType;
                    if (url.includes('cenc_eqlist')) {
                        dataType = 'cenc_eqlist';
                    } else if (url.includes('jma_eqlist')) { // This case might not be hit if only cenc_eqlist is in sources
                        dataType = 'jma_eqlist';
                    }
                    displayEqList(data, dataType);
                }
            });
        });

    }, 5000); // 每隔5秒钟刷新
});