import 'package:url_launcher/url_launcher.dart';

/// Opens hosted MiniPay checkout in an in-app browser when possible.
/// Custom Tabs / SFSafariViewController cannot inject MiniPay — user must open
/// the same URL inside MiniPay to sign.
Future<bool> launchMinipayCheckoutUrl(Uri uri) async {
  if (!await canLaunchUrl(uri)) return false;

  try {
    final inApp = await launchUrl(uri, mode: LaunchMode.inAppBrowserView);
    if (inApp) return true;
  } catch (_) {
    // inAppBrowserView unavailable on this platform/build.
  }

  return launchUrl(uri, mode: LaunchMode.externalApplication);
}
