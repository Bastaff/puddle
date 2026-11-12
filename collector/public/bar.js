(() => {
  const bar = document.currentScript?.previousElementSibling;
  if (!bar || !bar.matches('header.bar')) return;
  const page = bar.dataset.page || 'page', dash = ['me', 'team', 'person'].includes(page);
  const top = Object.assign(document.createElement('div'), { className: 'top' });
  bar.before(top); top.append(bar);
  const helper = /^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const q = new URLSearchParams(location.search);

  const appMe = (() => { try { const a = q.get('app'); if (a && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(a)) sessionStorage.setItem('puddle-me', a); return sessionStorage.getItem('puddle-me') || sessionStorage.getItem('joule-me'); } catch { return null; } })();
  const site = (to) => (helper ? `/go?to=${encodeURIComponent(to)}` : to);
  const meHref = helper ? '/' : appMe || '/?home=1';
  const teamHere = q.get('team') || (location.pathname.match(/^\/team\/([0-9a-f-]{36})/) || [])[1] || null;
  const here = page === 'me' ? 'me' : page === 'settings' ? 'settings' : location.pathname === '/sim' ? 'sim'
    : q.get('demo') === '1' ? '' : teamHere ? 'team:' + teamHere
    : !helper && ['/', '/person', '/project', '/work'].includes(location.pathname) ? 'me' : '';

  const I = {
    learn: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="10" opacity=".28"/><path d="M9 9.4a3 3 0 1 1 4.3 2.7c-.9.5-1.3 1.1-1.3 2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="17.6" r="1.6"/></svg>',
    theme: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="10" opacity=".28"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>',
    sound: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M3.5 9.2c0-.7.6-1.2 1.2-1.2h2.6l4.6-3.6c.8-.6 1.9 0 1.9 1v13.2c0 1-1.1 1.6-1.9 1L7.3 16H4.7c-.6 0-1.2-.5-1.2-1.2z"/><path class="waves" d="M16.4 8.6a4.8 4.8 0 0 1 0 6.8M18.9 6.1a8.3 8.3 0 0 1 0 11.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity=".55"/><g class="mute"><circle cx="19" cy="12" r="4.4" opacity=".28"/><path d="M17.3 10.3l3.4 3.4M20.7 10.3l-3.4 3.4" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></g></svg>',
    grid: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="11" height="8" rx="2.4"/><rect x="16" y="3" width="5" height="8" rx="2" opacity=".55"/><rect x="3" y="13" width="5" height="8" rx="2" opacity=".55"/><rect x="10" y="13" width="11" height="8" rx="2.4"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(0 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(45 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(90 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(135 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(180 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(225 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(270 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(315 12 12)"/><path fill-rule="evenodd" d="M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm0 4.4a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Z"/></svg>',
  };
  globalThis.PUDDLE_GEAR = I.gear;

  const has = { share: page === 'me', demo: page === 'team', arrange: dash, learn: dash, sound: page === 'team', range: dash };
  const rangeNow = (() => { try { const r = page === 'team' ? JSON.parse(store.get('cu2') || '{}').range || '7d' : store.get('pv-range') || '7d'; return r === 'today' ? '1d' : r; } catch { return '7d'; } })();
  const ranges = [['1d', '1D', 'Last 24 hours'], ['7d', '7D', 'Last 7 days'], ['30d', '30D', 'Last 30 days'], ['90d', '90D', 'Last 90 days']];
  const CARET = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.6 6 7.6l3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const keep = [...bar.children];
  const settingsHref = helper ? site('/settings') : '/settings';
  const WORD = '<svg class="word" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true" preserveAspectRatio="xMinYMid meet" viewBox="30 118 627 200"><g><g><path d="M52.0293,212.3741c0-10.4634-.4797-17.8828,.1293-25.2118,.6639-7.9893,4.5806-14.1374,12.7675-16.7585,4.0001-1.2806,7.8869-.9293,11.5004,.9645,2.2172,1.1621,3.8963,.9914,6.0292-.1883,21.1093-11.6742,49.1592-6.0879,63.4262,13.2503,9.7305,13.1891,13.6009,28.3187,8.403,44.2585-8.0705,24.7486-31.4978,37.5995-56.2581,32.5895-2.5299-.512-4.9875-1.4106-7.4505-2.2155-2.4891-.8135-3.1926-.2942-3.1412,2.3333,.1546,7.9036,.415,15.8091,.3507,23.7115-.0435,5.3439-1.7805,10.1405-6.842,12.8064-8.732,4.5992-20.616,3.0413-24.4204-6.7885-.5148-1.3301-.8372-2.803-.9074-4.2266-1.2757-25.8655-2.4991-51.7336-3.5868-74.5248Zm51.6243,20.174c11.4743,.1833,18.5295-8.6928,18.6735-18.4296,.1419-9.5971-8.5756-18.3017-18.0309-18.3116-11.1107-.0117-19.6248,8.155-19.5574,18.7592,.064,10.0672,8.3923,17.9847,18.9149,17.982Z"/><path d="M425.1,174.4261c.1484-1.8435,.3185-3.0505,.3307-4.2589,.0692-6.8636-.0893-13.7357,.2005-20.5891,.2696-6.3738,4.5463-11.1042,10.7346-12.5589,7.3365-1.7245,13.9284,.1333,16.7501,5.5828,1.5524,2.9981,2.36,6.7176,2.3822,10.1192,.1909,29.2232,.1589,58.4482,.0932,87.6724-.0078,3.4861-.2181,7.0654-1.0198,10.4386-2.4646,10.3692-17.1344,12.5192-23.526,6.9191-2.3598-2.0676-4.1052-1.8138-6.6219-.5824-19.1582,9.3737-47.6188,2.9593-58.2732-20.3676-8.4306-18.458-4.4347-45.5106,14.3831-58.5238,11.808-8.1657,24.7759-9.5169,38.4387-5.9637,1.8784,.4885,3.683,1.2605,6.1279,2.1124Zm-16.7156,24.5061c-9.4186-.1067-17.1947,7.6147-17.2744,17.1529-.0775,9.2652,7.2831,16.7329,16.7053,16.9485,9.1602,.2096,17.3815-7.829,17.5134-17.1242,.1252-8.817-7.9171-16.8749-16.9444-16.9771Z"/><path d="M503.6955,223.7735c.7167-18.2607,6.4935-34.4473,21.5302-45.7451,20.0075-15.0325,46.8592-14.4756,64.8929,.8151,8.4058,7.1272,13.5044,16.3003,14.9137,27.3366,1.5437,12.0903-3.2111,19.0083-15.166,21.3616-12.9596,2.5512-26.0007,4.6887-39.008,6.9971-1.3246,.235-2.7214,.2254-3.977,.6487-1.7312,.5836-3.3599,1.4713-5.0326,2.2287,.9656,1.6129,1.6307,3.5447,2.9474,4.7848,6.6291,6.2435,14.6302,7.0057,22.9492,4.6962,3.8256-1.0619,7.4813-2.9731,10.9844-4.9137,9.419-5.2179,20.2045-.631,22.2281,9.6513,.9965,5.0632-1.0507,9.0682-4.5396,12.5157-11.2143,11.0817-25.2001,14.5963-40.3509,14.1133-17.3725-.5538-31.7301-7.501-41.9488-21.8871-6.8908-9.7011-11.0129-20.3998-10.4231-32.6034Zm53.4604-28.0146c-8.5082-.0436-14.9646,4.7243-18.1122,13.3635-1.0209,2.8019-.2309,3.9413,2.7833,3.4345,8.9097-1.4979,17.8024-3.1051,26.6763-4.8026,3.0204-.5778,3.6516-2.5135,1.9998-5.0882-3.124-4.8694-7.6868-6.9367-13.3472-6.9072Z"/><path d="M253.7867,203.4153c-.4693,7.661-.2949,15.4277-1.5329,22.9624-3.2341,19.6829-17.5608,33.1176-37.4667,35.2145-16.0289,1.6884-30.4217-2.2343-41.4111-14.8215-6.9087-7.9132-9.8307-17.5985-10.2417-27.8512-.4287-10.6925-.1526-21.4205,.0562-32.1283,.1152-5.9087,1.5656-11.3192,7.4107-14.4683,10.4833-5.6481,22.1442,.8541,22.3687,12.6493,.1999,10.5007,.048,21.009,.3152,31.5072,.1597,6.2748,2.5899,11.4543,8.4917,14.571,7.2574,3.8326,17.3346,.0116,19.7449-7.8288,.9312-3.0291,1.4275-6.297,1.4894-9.4685,.1906-9.7716-.0246-19.5507,.1149-29.3241,.0933-6.5385,3.8842-11.365,9.7239-12.9438,7.405-2.0018,15.1991,.3481,18.1559,6.081,1.3747,2.6654,1.9518,5.939,2.1301,8.9815,.328,5.5963,.0936,11.2254,.0936,16.8409,.1858,.0088,.3716,.0177,.5574,.0265Z"/><path d="M496.5601,194.2504c0,16.7326,.0407,33.4654-.0429,50.1976-.0128,2.5696-.1639,5.2896-1.0062,7.6733-1.9325,5.4688-6.2615,8.0063-11.9282,8.5108-6.0185,.5359-11.6686-.2609-14.9914-5.9312-1.4011-2.391-2.1892-5.5016-2.2029-8.2903-.1652-33.7774-.1813-67.5559-.1078-101.3338,.0128-5.8681,1.2327-11.5582,6.9085-14.791,7.4122-4.2218,18.6622-3.0816,22.1031,5.2488,1.0305,2.4947,1.2703,5.4549,1.2886,8.2058,.1119,16.836,.0559,33.673,.0559,50.5098-.0256,0-.0512,.0001-.0767,.0002Z"/><path d="M323.7195,174.4261c.1484-1.8435,.3185-3.0505,.3307-4.2589,.0692-6.8636-.0893-13.7357,.2005-20.5891,.2696-6.3738,4.5463-11.1042,10.7346-12.5589,7.3365-1.7245,13.9284,.1333,16.7501,5.5828,1.5524,2.9981,2.36,6.7176,2.3822,10.1192,.1909,29.2232,.1589,58.4482,.0932,87.6724-.0078,3.4861-.2181,7.0654-1.0198,10.4386-2.4646,10.3692-17.1344,12.5192-23.526,6.9191-2.3598-2.0676-4.1052-1.8138-6.6219-.5824-19.1582,9.3737-47.6188,2.9593-58.2732-20.3676-8.4306-18.458-4.4347-45.5106,14.3831-58.5238,11.808-8.1657,24.7759-9.5169,38.4387-5.9637,1.8784,.4885,3.683,1.2605,6.1279,2.1124Zm-16.7156,24.5061c-9.4186-.1067-17.1947,7.6147-17.2744,17.1529-.0775,9.2652,7.2831,16.7329,16.7053,16.9485,9.1602,.2096,17.3815-7.829,17.5134-17.1242,.1252-8.817-7.9171-16.8749-16.9444-16.9771Z"/></g></g></svg>';
  const MARK = '<svg class="mark" xmlns="http://www.w3.org/2000/svg" viewBox="100 100 824 824" aria-hidden="true"><rect x="100" y="100" width="824" height="824" rx="185" fill="#0865fc"/><svg x="172" y="377" width="680" height="299" viewBox="15 80 625 275"><g><g><g><g><path d="M567.5872,316.0624c-15.388-.3971-29.182-1.2941-41.9367-7.5986-4.8995-2.4217-9.9767-5.257-10.3758-11.3517-.4189-6.3982,4.156-10.4236,9.1944-13.1504,26.2358-14.1988,53.5087-15.9264,81.5808-6.0748,1.4391,.5051,2.8064,1.2506,4.1483,1.9907,5.5328,3.0514,10.7459,6.6081,10.8125,13.7176,.0644,6.8721-5.1894,10.3426-10.3017,13.2821-13.819,7.9453-29.1833,8.8436-43.1219,9.1851Z" fill="#fbfbfb"/><g><path d="M580.7104,306.7536c-.5266,0-1.0624,.0516-1.5775-.0115-.872-.1069-2.1433-.0034-2.167-.9874-.0223-.9234,1.22-1.0848,2.092-1.1595,4.8112-.4125,9.4704-1.3528,14.0277-2.6505,3.507-.9987,6.8217-2.3152,9.643-4.3551,4.3974-3.1794,4.0427-6.7651-.954-9.2666-1.1751-.5883-2.4679-1.0168-3.7071-1.5177-.417-.1686-.9228-.3295-.9443-.7529-.0252-.4972,.4891-.7261,.977-.9124,1.1191-.4271,2.3065-.5093,3.4775-.2753,3.2818,.6557,6.4368,1.5883,9.0591,3.4188,3.5149,2.4538,3.9457,5.3812,1.3048,8.5041-1.7,2.0101-4.0408,3.4119-6.6101,4.5567-7.6804,3.422-16.0027,4.8922-24.621,5.4094Z" fill="#0e6afa" opacity=".32"/><path d="M557.3167,281.3541c.5842,0,1.1787-.0516,1.7502,.0115,.9675,.1069,2.3778,.0034,2.4041,.9874,.0248,.9234-1.3535,1.0848-2.3209,1.1595-5.3377,.4125-10.5069,1.3528-15.5628,2.6505-3.8908,.9987-7.5682,2.3152-10.6983,4.3551-4.8786,3.1794-4.4852,6.7651,1.0584,9.2666,1.3037,.5883,2.7379,1.0168,4.1128,1.5177,.4626,.1686,1.0238,.3295,1.0476,.7529,.0279,.4972-.5426,.7261-1.0839,.9124-1.2416,.4271-2.5589,.5093-3.858,.2753-3.641-.6557-7.1412-1.5883-10.0505-3.4188-3.8995-2.4538-4.3775-5.3812-1.4476-8.5041,1.886-2.0101,4.4831-3.4119,7.3335-4.5567,8.5209-3.422,17.7539-4.8922,27.3154-5.4094Z" fill="#0e6afa" opacity=".32"/></g></g><g><g><path d="M552.5446,209.1638c-7.9204-9.8-17.9302-15.33-28.71-19.09-20.7202-7.24-26.7402-3.3199-39.3105-7.63-15.6895-5.38-20.5898-19.03-38.8896-37.8101-20.3999-20.9199-43.71-29.6599-61.0703-36.1699-6.3398-2.38-24.2998-8.74-48.2295-11.42-17.9502-2.0099-76.9102-6.2599-132.6201,26.72-42.52,25.18-38.6904,45.72-72.5601,52.73-14.8301,3.0699-35.2803,3.21-61.6401,13.98-5.3701,2.1899-16.5898,7.79-25.7798,19.21-10.0601,12.5-10.0903,26.48-.2002,39.0601,7.7603,9.8799,18.1099,14.1299,28.8101,16.8899,19.9697,5.1401,40.3701,4.1401,60.6299,4.8901,15.73,.58,31.4302,1.74,46.1602,9.2,7.8501,3.97,8.1396,5.36,3.6699,13.96-5.5498,10.6799-4.1499,17.73,4.9102,24.5901,6.1299,4.6399,12.9399,7.4099,20.0098,9.0999,36.1104,8.6801,72.1104,5.6001,107.8999-2.4299,29.1704-6.55,58.2402-13.51,86.8701-11.7,7.8599,0,14.4102,.1599,20.9502-.05,6.54-.2,13.1001-.4299,19.6001-1.27,12.7798-1.6499,25.6396-3.27,37.0195-11.3,3.6504-2.5699,7.3003-5.7699,6.2305-11.46-1.0903-5.79,1.4199-8.45,4.9097-11.2,8.6602-6.8201,18.6499-9.75,28.29-13.77,10.6299-4.4299,21.8198-7.37,30.9102-15.99,12.0898-11.47,12.8901-25.73,2.1401-39.04Zm-283.6304,33.0801c-.5298,.22-12.1401,4.76-22.6699-1.1301-14.4199-8.0499-16.96-30.0898-11.9897-45.22,4.4399-13.5599,17.3096-28.95,32.96-28.48,1.1499,.03,10.3398,.4401,17.0098,7.3701,15.7202,16.3398,7.1401,58.2899-15.3101,67.46Zm74.02,5.6899c-.5298,.22-12.1396,4.75-22.6699-1.13-14.4199-8.0599-16.9502-30.09-11.9902-45.23,4.4404-13.5499,17.3105-28.9401,32.9604-28.47,1.1499,.0299,10.3398,.4399,17.0098,7.37,15.73,16.33,7.1401,58.29-15.3101,67.46Z" fill="#fbfbfb"/><g><path d="M490.9184,261.1874c-.8778,0-1.7711,.1383-2.6299-.0309-1.4537-.2864-3.573-.0092-3.6125-2.6441-.0372-2.4728,2.0338-2.9049,3.4875-3.1052,8.0206-1.1047,15.7881-3.6227,23.3854-7.0978,5.8466-2.6743,11.3723-6.2,16.0758-11.6628,7.3308-8.5141,6.7396-18.1166-1.5905-24.8153-1.959-1.5754-4.1141-2.7228-6.1801-4.0643-.6952-.4514-1.5385-.8823-1.5742-2.0163-.042-1.3315,.8153-1.9445,1.6288-2.4432,1.8657-1.1437,3.8451-1.3639,5.7972-.7373,5.4711,1.756,10.7307,4.2532,15.1023,9.1554,5.8596,6.5711,6.5779,14.4105,2.1752,22.7733-2.834,5.3829-6.7365,9.1368-11.0197,12.2025-12.8038,9.1639-26.6779,13.1008-41.0454,14.486Z" fill="#0e6afa" opacity=".32"/><path d="M101.9282,255.7788c-12.7448-.3817-24.8951-1.538-36.4601-6.147-4.6837-1.8666-9.0796-4.1961-12.5103-8.0062-4.7022-5.2222-5.0254-10.7595-.6683-16.2464,3.5007-4.4084,7.4996-8.1985,13.8878-7.049,1.4786,.266,3.133,.5768,3.7249,2.1381,.6511,1.7175-1.1367,2.2775-2.0458,3.1716-5.715,5.6211-5.3276,11.6413,1.1832,16.4335,3.9812,2.9304,8.5353,4.7083,13.2864,5.8678,12.2282,2.9839,24.618,3.9279,37.1805,2.8002,2.6107-.2343,6.6806-.9698,7.1046,2.1742,.4307,3.1941-3.7375,2.8807-6.1151,3.3087-6.2764,1.1299-12.6472,1.4402-18.5676,1.5544Z" fill="#0e6afa" opacity=".32"/><path d="M238.0465,320.9938c-12.3971-.2889-24.7056-1.0722-36.113-6.7468-2.7215-1.3538-5.2026-2.9723-7.019-5.4666-1.2045-1.6541-1.2654-3.2075,.3927-4.6227,2.3174-1.9779,8.7986-2.0694,10.4737,.3307,2.1813,3.1254,5.2716,4.6015,8.5474,5.6882,14.78,4.9029,29.8718,5.361,45.119,2.6709,2.5871-.4565,5.129-1.1265,7.7725-.3648,1.2346,.3557,2.555,.6638,2.6002,2.2193,.0393,1.3494-1.1782,1.8845-2.1932,2.2831-4.3346,1.7021-8.9106,2.455-13.4958,2.9994-5.3315,.6331-10.6822,1.2095-16.0846,1.0092Z" fill="#0e6afa" opacity=".32"/></g></g><g><g><path d="M258.3306,246.088c-4.7979,0-9.1934-1.0977-13.0625-3.2627-14.8994-8.3174-18.3047-31.1787-12.9141-47.5889,4.8604-14.8408,18.1553-29.8672,34.1611-29.8672,.2529,0,.5049,.0039,.7588,.0117,1.8291,.0479,11.3438,.6602,18.3916,7.9824,7.7168,8.0205,10.4971,22.5176,7.2578,37.834-3.3379,15.7764-12.2471,28.3691-23.2529,32.8643-.1865,.0781-4.9414,2.0264-11.3398,2.0264Z" fill="#fbfbfb"/><path d="M266.5147,167.3699c.2329,0,.4658,.0034,.6997,.0105,1.1499,.03,10.3398,.4402,17.0098,7.3701,15.7202,16.3398,7.1401,58.2898-15.3101,67.46-.3232,.1343-4.7725,1.877-10.584,1.877-3.7129,0-7.981-.7109-12.0859-3.0071-14.4199-8.0498-16.96-30.0898-11.9897-45.22,4.3735-13.3569,16.9277-28.49,32.2603-28.4905m0-4h0c-16.958,.0005-30.9775,15.719-36.0615,31.2458-2.7964,8.5115-3.3013,18.4832-1.3848,27.3542,2.2339,10.3416,7.6411,18.3689,15.2261,22.603,4.168,2.3315,8.8916,3.5144,14.0356,3.5144,6.7827,0,11.9033-2.0935,12.1177-2.1826,11.5894-4.7336,20.959-17.8774,24.4316-34.2935,3.375-15.9556,.397-31.1426-7.7729-39.634-7.5913-7.8875-17.8154-8.5439-19.7876-8.5955-.2588-.0078-.5312-.012-.8042-.012h0Z" fill="#161a21"/></g><g><path d="M332.3531,251.7735c-4.7988,0-9.1943-1.0957-13.0635-3.2568-15.083-8.4307-18.4111-30.8223-12.915-47.5996,4.8613-14.8369,18.1562-29.8574,34.1611-29.8574,.2529,0,.5049,.0039,.7588,.0117,1.8291,.0479,11.3438,.6602,18.3916,7.9824,7.7148,8.0098,10.499,22.4971,7.2646,37.8076-3.335,15.79-12.248,28.3926-23.2607,32.8906-.1885,.0781-4.9414,2.0215-11.3369,2.0215Z" fill="#fbfbfb"/><path d="M340.5347,173.0601c.2324,0,.4658,.0034,.6997,.0105,1.1499,.0298,10.3398,.4399,17.0098,7.3699,15.73,16.3298,7.1401,58.29-15.3101,67.46-.3232,.1343-4.7715,1.8726-10.5811,1.8726-3.7134,0-7.9829-.7097-12.0889-3.0027-14.4199-8.0598-16.9497-30.0898-11.9897-45.23,4.3735-13.3472,16.9268-28.48,32.2603-28.4802m0-4h-.0005c-16.9551,.0002-30.9751,15.7131-36.061,31.2346-5.748,17.5466-2.1431,41.0339,13.8394,49.9673,4.1729,2.3301,8.896,3.511,14.0405,3.511,6.7905,0,11.9009-2.0894,12.1147-2.1785,11.5967-4.7366,20.9697-17.8906,24.4399-34.3198,3.3691-15.9504,.3872-31.1279-7.7827-39.6091-7.5918-7.8879-17.8149-8.5425-19.7871-8.5938-.2573-.0076-.5308-.0117-.8032-.0117h0Z" fill="#161a21"/></g><path d="M248.5539,207.7084c2.4318-11.7656,10.0462-18.9197,18.5794-17.4561,8.6522,1.4838,12.9561,10.9229,10.382,22.7697-2.4783,11.4057-10.6187,19.0415-18.7664,17.6031-8.6005-1.5183-12.7088-10.7535-10.195-22.9167Z" fill="#161a21"/><path d="M322.6068,211.3667c2.4558-11.882,10.1455-19.1069,18.7632-17.6288,8.7378,1.4985,13.0843,11.0309,10.4847,22.9949-2.5028,11.5185-10.7237,19.2298-18.952,17.7772-8.6855-1.5333-12.8345-10.8599-10.2958-23.1433Z" fill="#161a21"/></g></g></g></g></g></svg></svg>';
  bar.innerHTML = `<a class="brand" href="${meHref}" aria-label="Puddle: Me" title="Puddle: Me">${MARK}<b>${WORD}</b></a>
<nav class="places" id="site-nav" aria-label="Pages"></nav>
<span class="bar-gap"></span>
<span class="bar-tools">
<button class="pill status" id="status" type="button" data-learn="bar:health" aria-live="polite" hidden><i class="dot"></i><span>…</span></button>
${has.range ? `<span class="range-pick" data-learn="bar:range"><button type="button" class="rp-btn" id="range-btn" aria-haspopup="menu" aria-expanded="false" title="Date range"><span class="rp-now">${(ranges.find((r) => r[0] === rangeNow) || ranges[1])[1]}</span>${CARET}</button><nav class="rp-menu" id="range" aria-label="Date range" role="menu" hidden>${ranges.map(([k, l, long]) => `<button type="button" role="menuitemradio" data-r="${k}" aria-pressed="${k === rangeNow}"><b>${l}</b><span>${long}</span></button>`).join('')}</nav></span>` : ''}
${has.demo ? `<button class="pill demo-btn" id="demo-btn" type="button" data-act="demo" data-tuck="5" aria-pressed="false" data-learn="bar:demo" title="A synthetic demo team to try things on. Your data is untouched.">Demo</button>` : ''}
${has.share ? `<button class="pill primary" id="share-live" type="button" data-tuck="5" title="A public page of your own agent work, live">Share live</button>` : ''}
${has.arrange ? `<button class="icon-btn lay-btn" id="arrange-btn" type="button" data-tuck="3" aria-pressed="false" aria-label="Arrange" data-learn="bar:arrange" title="Arrange the page: move, resize and hide cards">${I.grid}<span class="lay-n" hidden></span></button>` : ''}
${has.learn ? `<button class="icon-btn learn-btn" id="learn-btn" type="button" data-tuck="2" aria-pressed="false" aria-label="Explain this page" data-learn="bar:learn" title="Explain this page">${I.learn}</button>` : ''}
${has.sound ? `<button class="icon-btn sound-btn" id="sound-btn" type="button" data-tuck="1" aria-pressed="false" aria-label="Sounds" data-learn="bar:sound" title="Sounds">${I.sound}</button>` : ''}
<button class="icon-btn theme-btn" id="theme-btn" type="button" data-tuck="4" aria-label="Theme" title="Theme" data-learn="bar:theme">${I.theme}</button>
<a class="icon-btn settings-btn${here === 'settings' ? ' on' : ''}" id="settings-btn" href="${settingsHref}" aria-label="Settings" title="Settings"${here === 'settings' ? ' aria-current="page"' : ''}>${I.gear}</a>
<button class="icon-btn more-btn${here === 'settings' ? ' on' : ''}" id="more-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Settings and more" title="Settings and more" hidden>${I.gear}${CARET}</button>
</span>`;
  for (const k of keep) bar.querySelector('#settings-btn').before(k);

  const nav = bar.querySelector('#site-nav');
  let offline = !navigator.onLine;
  const needsSite = (a) => (helper ? a.getAttribute('href')?.startsWith('/go') : a.dataset.k !== 'me');
  const lastTeam = { get: () => store.get('puddle-last-team'), set: (v) => store.set('puddle-last-team', v) };
  if (here.startsWith('team:') && teamHere) lastTeam.set(teamHere);
  const teamHref = (t) => site(t.canView ? `/?team=${t.id}` : `/team/${t.id}/share`);
  let openPop = null;
  const closePop = (focus) => openPop?.close(focus);
  const place = (btn, panel) => {
    const r = btn.getBoundingClientRect(), b = bar.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(r.right - b.left - panel.offsetWidth, b.width - panel.offsetWidth - 8))}px`;
    panel.style.top = `${r.bottom - b.top + 6}px`;
  };
  function popup(btn, make) {
    function close(focus) {
      if (openPop?.btn !== btn) return; const { panel, owned } = openPop; openPop = null;
      if (owned) panel.remove(); else panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false'); if (focus) btn.focus();
    }
    function open() {
      closePop();
      const { panel, owned, first } = make(); if (!panel) return;
      if (owned) bar.append(panel); panel.hidden = false; place(btn, panel);
      btn.setAttribute('aria-expanded', 'true'); openPop = { btn, panel, owned, close };
      const items = () => [...panel.querySelectorAll('a, button, input')].filter((x) => x.offsetParent && !x.hidden);
      panel.onkeydown = (e) => {
        const list = items(), i = list.indexOf(document.activeElement);
        if (e.key === 'Escape') { e.preventDefault(); close(true); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); list[Math.min(list.length - 1, i + 1)]?.focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); list[Math.max(0, i - 1)]?.focus(); }
      };
      (first || items()[0])?.focus();
    }
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (openPop?.btn === btn) close(); else open(); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && openPop?.btn !== btn) { e.preventDefault(); open(); } });
    return { open, close };
  }
  document.addEventListener('pointerdown', (e) => { if (openPop && !openPop.panel.contains(e.target) && !openPop.btn.contains(e.target)) closePop(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && openPop) closePop(true); });

  function teamMenu(teams, d) {
    const menu = Object.assign(document.createElement('div'), { className: 'place-menu', role: 'menu' });
    const search = teams.length >= 8;
    menu.innerHTML = `${search ? '<input class="pm-find" type="search" placeholder="Find a team" aria-label="Find a team">' : ''}
      <div class="pm-list">${teams.map((t) => `<a role="menuitem" href="${teamHref(t)}" data-k="team:${esc(t.id)}" data-name="${esc(t.name.toLowerCase())}" class="${here === 'team:' + t.id ? 'on' : ''}"${here === 'team:' + t.id ? ' aria-current="page"' : ''}>${esc(t.name)}</a>`).join('')}</div>
      <div class="pm-sep"></div>
      <a role="menuitem" href="${site('/team/new')}" data-k="start" class="pm-new">Start a team</a>
      ${d?.sim ? `<a role="menuitem" href="${site('/sim')}" data-k="sim">Simulate</a>` : ''}`;
    const find = menu.querySelector('.pm-find');
    find?.addEventListener('input', () => { const q = find.value.trim().toLowerCase(); for (const a of menu.querySelectorAll('.pm-list a')) a.hidden = q && !a.dataset.name.includes(q); });
    find?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); menu.querySelector('.pm-list a:not([hidden])')?.click(); } });
    menu.addEventListener('click', placeClick);
    return { panel: menu, owned: true, first: find || menu.querySelector('a.on') };
  }
  function paintNav(d) {
    if (openPop?.btn.closest('#site-nav')) closePop();
    const link = (href, label, key, cls = '', title = '') => `<a href="${href}" data-k="${esc(key)}" class="${cls}${here === key ? ' on' : ''}"${here === key ? ' aria-current="page"' : ''}${title ? ` title="${esc(title)}"` : ''}>${label}</a>`;
    const teams = d?.teams || [];
    const shown = teams.find((t) => here === 'team:' + t.id) || teams.find((t) => t.id === lastTeam.get()) || teams[0];
    let html = link(meHref, 'Me', 'me');
    for (const t of teams) if (t === shown || t.canView !== false) html += link(teamHref(t), `<span class="pl-name">${esc(t.name)}</span>`, 'team:' + t.id, t === shown ? 'team' : 'team extra', t.name);
    if (teams.length) html += `<button type="button" class="caret" aria-haspopup="menu" aria-expanded="false" aria-label="${teams.length > 1 ? `All ${teams.length} teams` : 'Teams'}" title="${teams.length > 1 ? `All ${teams.length} teams` : 'Teams'} · start a team">${CARET}</button>`;
    else if (d && d.signedOut && d.signIn) html += `<a href="${esc(d.signIn)}" data-k="signin" class="add" title="Sign in to start or join a team">+ Team</a>`;
    else if (d && !d.signedOut) html += link(site('/team/new'), '+ Team', 'start', 'add', 'Start a team');
    if (d?.sim && !teams.length) html += link(site('/sim'), 'Simulate', 'sim', 'add');
    nav.innerHTML = html;
    const caret = nav.querySelector('.caret'); if (caret) popup(caret, () => teamMenu(teams, d));
    paintOffline();
    fit();
    if (trailOn) paintTrail();
  }
  let known = null; try { known = JSON.parse(store.get('puddle-nav') || 'null'); } catch {}

  const rp = bar.querySelector('#range'), rpBtn = bar.querySelector('#range-btn');
  if (rp && rpBtn) {
    const pop = popup(rpBtn, () => ({ panel: rp, first: rp.querySelector('[aria-pressed="true"]') }));
    const label = () => { const b = rp.querySelector('[aria-pressed="true"]'); if (b) rpBtn.querySelector('.rp-now').textContent = b.querySelector('b').textContent; };
    rp.addEventListener('click', (e) => { if (e.target.closest('button')) setTimeout(() => pop.close(true)); });
    new MutationObserver(label).observe(rp, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
    label();
  }

  const more = bar.querySelector('#more-btn'), settingsBtn = bar.querySelector('#settings-btn');
  const tools = [...bar.querySelectorAll('[data-tuck]')].sort((a, b) => a.dataset.tuck - b.dataset.tuck);
  const pressed = (el) => el.getAttribute('aria-pressed') === 'true';
  const CHECK = '<i class="gm-on" aria-hidden="true">✓</i>';
  function gearMenu() {
    const m = Object.assign(document.createElement('div'), { className: 'place-menu gear-menu', role: 'menu' });
    const row = (el, label, extra = '') => `<button type="button" role="menuitem" data-for="${el.id}"${el.getAttribute('aria-disabled') === 'true' ? ' aria-disabled="true"' : ''}><span>${label}</span>${extra}</button>`;
    const theme = globalThis.PuddleTheme?.get?.() || 'auto';
    const LABELS = { 'arrange-btn': 'Arrange this page', 'learn-btn': 'Explain this page', 'demo-btn': 'Demo team', 'share-live': 'Share live' };
    const items = tools.filter((el) => el.classList.contains('tucked')).sort((a, b) => [...bar.querySelectorAll('[data-tuck]')].indexOf(a) - [...bar.querySelectorAll('[data-tuck]')].indexOf(b)).map((el) =>
      el.id === 'theme-btn' ? `<div class="gm-theme" role="group" aria-label="Theme"><span>Theme</span><span class="gm-seg">${['auto', 'light', 'dark'].map((t) => `<button type="button" role="menuitemradio" data-pick-theme="${t}" aria-pressed="${t === theme}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</span></div>`
        : el.id === 'sound-btn' ? row(el, 'Sounds', `<em>${pressed(el) ? 'On' : 'Off'}</em>`)
          : row(el, LABELS[el.id] || el.getAttribute('aria-label') || el.textContent.trim(), pressed(el) ? CHECK : ''));
    m.innerHTML = `${items.join('')}${items.length ? '<div class="pm-sep"></div>' : ''}
      <a role="menuitem" href="${esc(settingsBtn.getAttribute('href'))}" data-k="settings" class="${here === 'settings' ? 'on' : ''}">Settings</a>`;
    m.addEventListener('click', (e) => {
      const t = e.target.closest('[data-pick-theme]'); if (t) { globalThis.PuddleTheme?.set(t.dataset.pickTheme); for (const b of m.querySelectorAll('[data-pick-theme]')) b.setAttribute('aria-pressed', String(b === t)); return; }
      const b = e.target.closest('[data-for]'); if (b) { if (b.getAttribute('aria-disabled') === 'true') return; closePop(true); bar.querySelector('#' + b.dataset.for)?.click(); return; }
      const a = e.target.closest('a'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      if (settingsBtn.getAttribute('aria-disabled') === 'true') { e.preventDefault(); nudge(); return; }
      closePop(); for (const x of nav.querySelectorAll('a.on')) x.classList.remove('on'); more.classList.add('on'); opening();
    });
    return { panel: m, owned: true };
  }
  popup(more, gearMenu);
  const markMore = () => more.classList.toggle('lit', tools.some((el) => el.classList.contains('tucked') && el.id !== 'sound-btn' && pressed(el)));
  new MutationObserver(markMore).observe(bar, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });

  const sub = Object.assign(document.createElement('nav'), { className: 'subbar', id: 'trail' });
  sub.setAttribute('aria-label', 'You are here');
  top.append(sub);
  const under = ['/project', '/work'].includes(location.pathname) || (location.pathname === '/person' && q.has('user'));
  let trailOn = under, title = location.pathname === '/work' ? 'Conversations'
    : location.pathname === '/project' ? (q.get('p') || '').split(/[\\/]/).filter(Boolean).pop() || null : null;
  const CHEV = '<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><path d="M7.5 2.5 2.5 8l5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function paintTrail() {
    sub.hidden = !trailOn; if (!trailOn) { sub.innerHTML = ''; return; }
    const steps = []; let u = new URL(location.href);
    for (let i = 0; i < 4; i++) {
      const b = u.searchParams.get('back'); if (!b || !b.startsWith('/') || b.startsWith('//') || b.startsWith('/\\')) break;
      const next = new URL(b, location.origin); if (next.pathname === '/') break;
      steps.unshift({ href: b, label: (u.searchParams.get('bt') || 'Back').slice(0, 40) }); u = next;
    }
    const tid = here.startsWith('team:') ? here.slice(5) : null;
    const place = q.get('demo') === '1' ? { href: '/?demo=1', label: 'Demo team' }
      : tid ? { href: site(`/?team=${tid}`), label: (known?.teams || []).find((t) => t.id === tid)?.name || 'Team' } : { href: meHref, label: 'Me' };
    steps.unshift(place);
    const prev = steps[steps.length - 1];
    sub.innerHTML = `<div class="sb-in"><a class="sb-back" href="${esc(prev.href)}" title="Back to ${esc(prev.label)}">${CHEV}<span>Back</span></a>
      <ol class="sb-path">${steps.map((x) => `<li><a href="${esc(x.href)}">${esc(x.label)}</a></li>`).join('')}<li aria-current="page">${title ? `<span>${esc(title)}</span>` : '<span class="sb-wait" aria-label="Loading"></span>'}</li></ol></div>`;
  }
  sub.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) opening(); });
  paintTrail();

  const over = () => bar.scrollWidth > bar.clientWidth + 1;
  const tuck = (el) => () => el.classList.add('tucked');
  const narrower = [...tools.map(tuck), () => bar.classList.add('quiet'), () => bar.classList.add('squeeze'), () => bar.classList.add('mark-only'), () => bar.classList.add('tight')];
  function fit() {
    bar.classList.remove('quiet', 'squeeze', 'mark-only', 'tight'); for (const el of tools) el.classList.remove('tucked');
    more.hidden = true; settingsBtn.hidden = false;
    const extra = [...nav.querySelectorAll('a.extra')];
    for (const a of extra) a.classList.remove('gone');
    for (const a of extra.reverse()) { if (!over()) break; a.classList.add('gone'); }
    for (let i = 0; i < narrower.length && over(); i++) {
      narrower[i]();
      if (i < tools.length) { more.hidden = false; settingsBtn.hidden = true; }
    }
    markMore();
  }
  if (typeof ResizeObserver === 'function') { let w = 0; new ResizeObserver(([e]) => { const nw = Math.round(e.contentRect.width); if (nw !== w) { w = nw; if (openPop) closePop(); fit(); } }).observe(bar); }
  document.fonts?.ready.then(fit);

  const st = { stream: null, fetched: 'ok', check: null, since: Date.now() };
  const statusEl = bar.querySelector('#status');
  const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  function paintStatus() {
    let level = 'ok', text = 'Live', title = 'What you see is current and updates by itself.';
    const local = helper && page !== 'settings';
    if (offline) {
      level = 'warn'; text = 'No internet';
      title = local ? 'Your own numbers still update live from this Mac. Teams and Settings come back when you’re online.'
        : `Showing what was here at ${hhmm(st.since)}. Puddle keeps counting on your Mac and sends it when you’re back.`;
    } else if (st.fetched === 'busy') { level = 'warn'; text = 'Busy'; title = `Puddle is busy for a moment: showing what was here at ${hhmm(st.since)}. It catches up by itself.`; }
    else if (st.fetched === 'fail') { level = 'warn'; text = 'Reconnecting…'; title = `Can’t reach Puddle right now: showing what was here at ${hhmm(st.since)}. It tries again by itself.`; }
    else if (st.stream === false && performance.now() < 3000) { setTimeout(paintStatus, 3000 - performance.now()); }
    else if (st.stream === false) { level = 'warn'; text = 'Connecting…'; title = 'The live connection is reopening. The numbers are current as of the last update.'; }
    else if (st.stream === null) { text = 'Online'; title = 'Connected.'; }
    else if (st.check) ({ level, text, title } = st.check);
    statusEl.className = `pill status ${level}`;
    const was = statusEl.hidden + statusEl.querySelector('span').textContent;
    statusEl.hidden = level === 'ok';
    statusEl.querySelector('span').textContent = text;
    statusEl.title = title; statusEl.setAttribute('aria-label', text);
    if (was !== statusEl.hidden + text) fit();
  }
  const note = Object.assign(document.createElement('div'), { className: 'net-note', role: 'status' }); note.hidden = true;
  document.addEventListener('DOMContentLoaded', () => document.body.append(note));
  function paintOffline() {
    for (const a of [...nav.querySelectorAll('a'), ...(openPop?.owned ? openPop.panel.querySelectorAll('a') : []), bar.querySelector('#settings-btn')]) {
      const block = offline && needsSite(a) && !a.classList.contains('on');
      a.classList.toggle('needs-net', block);
      if (block) a.setAttribute('aria-disabled', 'true'); else if (a.getAttribute('aria-disabled') === 'true') a.removeAttribute('aria-disabled');
      if (block) a.title = 'Needs an internet connection'; else if (a.title === 'Needs an internet connection') a.removeAttribute('title');
    }
    note.textContent = helper && page !== 'settings'
      ? 'No internet. Your own numbers keep updating from this Mac; teams come back when you’re online.'
      : `No internet. Showing what was here at ${hhmm(st.since)}. Puddle keeps counting on your Mac and sends it when you’re back.`;
    note.hidden = !offline;
  }
  const nudge = () => { note.hidden = false; note.classList.remove('nudge'); void note.offsetWidth; note.classList.add('nudge'); };
  const placeClick = (e) => {
    const a = e.target.closest('a'); if (!a) return;
    if (a.classList.contains('needs-net')) { e.preventDefault(); nudge(); return; }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    for (const x of nav.querySelectorAll('a')) { x.classList.toggle('on', x === a); if (x === a) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); }
    bar.querySelector('#settings-btn')?.classList.remove('on');
    if (a.dataset.k?.startsWith('team:')) lastTeam.set(a.dataset.k.slice(5));
    closePop(); opening();
  };
  nav.addEventListener('click', placeClick);
  bar.querySelector('#settings-btn').addEventListener('click', (e) => { if (e.currentTarget.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; } for (const x of nav.querySelectorAll('a.on')) x.classList.remove('on'); e.currentTarget.classList.add('on'); opening(); });
  const opening = () => {
    const main = document.querySelector('main'); if (!main) return;
    main.setAttribute('aria-busy', 'true'); document.body.classList.add('leaving');
  };
  addEventListener('pageshow', (e) => { if (e.persisted && document.body.classList.contains('leaving')) location.reload(); });
  const net = (on) => { offline = !on; paintNav(known); paintStatus(); if (on) dispatchEvent(new Event('puddle:online')); };
  addEventListener('online', () => net(true));
  addEventListener('offline', () => net(false));
  if (q.get('offline') === '1' && helper) { offline = true; history.replaceState(null, '', location.pathname); }
  paintNav(known);

  document.addEventListener('click', (e) => {
    const x = e.target.closest?.('[data-close]'); if (x?.closest('dialog')) { x.closest('dialog').close(); return; }
    const d = e.target;
    if (d instanceof HTMLDialogElement && d.open) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); }
  });
  const tipped = (n) => { for (; n && n !== document; n = n.parentNode) if (n.ontouchstart) return true; return false; };
  document.addEventListener('touchstart', (e) => { if (!tipped(e.target)) for (const t of document.querySelectorAll('.tip')) t.hidden = true; }, { passive: true });

  globalThis.PuddleBar = {
    page, here,
    nav(d) { if (!d) return; if (d.offline) offline = true; else if (navigator.onLine) offline = false; known = d.offline ? (d.teams?.length ? d : known) : d; if (!d.offline) store.set('puddle-nav', JSON.stringify(d)); paintNav(known); paintStatus(); },
    stream(on) { st.stream = on; if (on) st.since = Date.now(); paintStatus(); },
    fetched(how) { st.fetched = how; if (how === 'ok') st.since = Date.now(); paintStatus(); },
    check(c) { st.check = c; paintStatus(); },
    get offline() { return offline; },
    from: (name) => `back=${encodeURIComponent(location.pathname + location.search)}&bt=${encodeURIComponent(String(name || '').slice(0, 40))}`,
    teamName: (id) => (known?.teams || []).find((t) => t.id === id)?.name || null,
    title(t) { title = t ? String(t) : null; trailOn = trailOn || Boolean(title); paintTrail(); },
  };
  paintStatus();
})();
