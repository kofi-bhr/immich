import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:immich_mobile/i18n/strings.g.dart';
import 'package:immich_mobile/presentation/components/image/immich_logo.widget.dart';
import 'package:immich_mobile/presentation/components/scaffold/adaptive_route_appbar.widget.dart';
import 'package:immich_mobile/utils/constants/size_constants.dart';

@RoutePage()
class AboutSettingsPage extends StatelessWidget {
  const AboutSettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const ImAdaptiveRouteAppBar(isPrimary: false),
      body: ListTile(
        title: Text(context.t.settings.about.third_party_title),
        subtitle: Text(context.t.settings.about.third_party_sub_title),
        onTap: () => showLicensePage(
          context: context,
          applicationName: context.t.immich,
          applicationIcon: const Padding(
            padding: EdgeInsets.only(top: SizeConstants.s),
            child: ImLogo(dimension: SizeConstants.xl),
          ),
        ),
      ),
    );
  }
}
