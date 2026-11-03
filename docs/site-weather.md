# Site weather and clock

The workspace header follows the selected database site name. The four weather
locations in `lib/weather/sites.ts` are the centers of the user's supplied Plus
Code pins. They were checked with Google's Open Location Code reference decoder:

- Rebel: `853WV7W2+9G` → 31.8959375, -101.7486875.
- Stiles: `CCJ8+8Q7 Stiles, Texas` → `853WCCJ8+8Q7` → 31.4307875, -101.583078125.
- East Stiles: `853WHG6C+H8` → 31.5614375, -101.4791875.
- Garden City: `VG7J+5VR Garden City, Texas` → `853WVG7J+5VR` → 31.8629875, -101.467859375.

Short codes were recovered near their named towns; forecasts use the pin
coordinates, not town centers. A site without a configured matching name shows
an unavailable-location message instead of borrowing another site's weather.
No database rows or schema were changed.

`GET /api/weather?site=<configured-key>` reads the National Weather Service point
and grid forecast. It accepts only the four configured keys, validates the
returned NWS endpoint, and times out upstream requests. Point metadata is cached
for 24 hours and forecast requests for 15 minutes. The client refreshes every
15 minutes, on a site change, or with the header Refresh button. Errors have a
Retry action and never substitute illustrative weather.

Seven calendar dates in America/Chicago are assembled from NWS day/night
periods. A thunderstorm forecast in either period highlights that date. Displayed
values are Fahrenheit high/low, maximum precipitation probability and maximum
forecast wind speed in mph; wind is not a gust reading. Unavailable numbers
remain blank. Expired periods are excluded and missing daytime highs after
sunset are not invented. Forecasts older than 24 hours or without all seven dates
are rejected. This is a forecast preview, not an active severe-weather alert feed.
The NWS link opens the pin's detailed forecast; its tooltip includes issuance time.

At viewport widths of 1600px and up the header shows all seven dates. Smaller
screens show the first three; the hidden dates are also excluded from keyboard
and screen-reader navigation. The redundant outlook heading is omitted. The full weather link is below Refresh, using the compact NWS label on phones.
The site selector uses a styled, keyboard-accessible Base UI menu with the
selected site marked and a visible dropdown arrow.

The top-right clock updates each second using America/Chicago, including the
CST/CDT change. Its initial placeholder avoids server/browser time mismatch.

References: [NWS API documentation](https://www.weather.gov/documentation/services-web-api),
[Google Open Location Code](https://github.com/google/open-location-code).
