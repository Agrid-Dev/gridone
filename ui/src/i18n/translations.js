export const translations = {
  en: {
    languages: {
      en: 'English',
      fr: 'French',
    },
  },
  fr: {
    languages: {
      en: 'Anglais',
      fr: 'Français',
    },
    language: {
      label: 'Langue',
      placeholder: 'Choisir la langue',
    },
    common: {
      logout: 'Déconnexion',
      menu: 'Menu',
      retry: 'Réessayer',
      online: 'En ligne',
      offline: 'Hors ligne',
      state: 'État',
      idLabel: 'ID',
      status: {
        connected: 'Connecté',
        connecting: 'Connexion en cours',
        disconnected: 'Déconnecté',
        error: 'Erreur',
      },
    },
    layout: {
      brand: {
        tagline: 'Énergie domestique',
      },
      nav: {
        dashboard: 'Tableau de bord',
        devices: 'Appareils',
        zones: 'Zones',
        settings: 'Paramètres',
      },
      sidebar: {
        zonesLabel: 'Zones',
        avgTemp: 'Temp. moy.',
        noZones: 'Aucune zone disponible',
        apiMode: 'Mode API',
      },
      header: {
        realtimeStatus: 'Statut en temps réel',
      },
    },
    login: {
      title: 'Console opérateur GridOne',
      subtitle: 'Connectez-vous pour accéder au tableau de bord intelligent.',
      form: {
        emailLabel: 'E-mail',
        emailPlaceholder: 'operateur@agrid.com',
        passwordLabel: 'Mot de passe',
        passwordPlaceholder: '••••••••',
      },
      errors: {
        generic: 'Impossible de se connecter',
      },
      actions: {
        signingIn: 'Connexion en cours…',
        submit: 'Se connecter',
      },
      notice: "État d'authentification stocké en mémoire pour une sécurité optimale.",
    },
    dashboard: {
      header: {
        title: "Vue d'ensemble",
        subtitle: "Visibilité en temps réel sur le climat, le confort et l'énergie.",
      },
      actions: {
        viewDevices: 'Voir tous les appareils',
      },
      cards: {
        totalDevices: {
          title: 'Appareils au total',
          helper: 'Sur {count} zones',
        },
        offline: {
          helper: 'Nécessite une intervention',
        },
        alerts: {
          title: 'Alertes',
          helper: 'Écarts de température et appareils hors ligne',
        },
      },
      deviceTypes: {
        title: 'Appareils par type',
        subtitle: 'Répartition en direct des équipements connectés',
        empty: 'Aucun appareil disponible.',
      },
      health: {
        title: 'Santé du système',
        subtitle: 'État global de tous les appareils',
        stability: 'Stabilité',
        attention: 'Attention',
        optimal: 'Optimal',
        onlineCoverage: 'Couverture en ligne',
        coverageDescription: 'des appareils répondent',
        alertMessage: '{count} appareil(s) hors plage attendue.',
        nominal: 'Tous les systèmes sont opérationnels.',
      },
      zones: {
        title: 'Statistiques rapides par zone',
        subtitle: 'Température, énergie et appareils actifs par zone',
        activeBadge: '{active}/{total} actifs',
        avgTemperature: 'Temp. moy. : {value}',
        energy: 'Énergie : {value} kW',
        empty: 'Aucune zone disponible.',
      },
      activity: {
        title: 'Activité récente',
        subtitle: "Derniers changements d'état",
        empty: 'Aucun événement pour le moment.',
      },
    },
    devices: {
      title: 'Appareils',
      subtitle: 'Surveillez chaque appareil connecté et explorez les détails.',
      tabs: {
        all: 'Tous',
      },
      empty: 'Aucun appareil dans cette zone.',
      metrics: {
        brightness: 'Luminosité',
        color: 'Couleur',
        current: 'Valeur actuelle',
        target: 'Consigne',
        mode: 'Mode',
        humidity: 'Humidité',
        updated: 'Mis à jour',
      },
      typeLabels: {
        air_conditioner: 'Climatiseur',
        thermostat: 'Thermostat',
        air_purifier: 'Purificateur',
        light: 'Lumière',
        fan: 'Ventilateur',
        sensor: 'Capteur',
      },
      states: {
        on: 'allumé',
        off: 'éteint',
      },
    },
    deviceDetail: {
      loading: "Chargement de l'appareil…",
      notFound: 'Appareil introuvable.',
      actions: {
        back: 'Retour aux appareils',
      },
      status: {
        success: 'Appareil mis à jour avec succès.',
        error: "Impossible de mettre à jour l'appareil.",
        applying: 'Application des modifications…',
      },
      controls: {
        title: 'Commandes',
        subtitle: 'Modifiez les réglages en temps réel.',
        power: 'Alimentation',
        powerDescription: "Allumez ou éteignez l'appareil",
        targetTemperature: 'Température cible',
        temperatureRange: '16 °C - 30 °C',
        selectMode: 'Sélectionner un mode',
        fanSpeed: 'Vitesse du ventilateur',
        auto: 'Auto',
        brightnessDescription: "Réglez l'intensité lumineuse",
        purifierSpeed: 'Vitesse du purificateur',
        selectSpeed: 'Choisir une vitesse',
      },
      modes: {
        cool: 'Froid',
        heat: 'Chauffage',
        fan: 'Ventilateur',
        auto: 'Auto',
      },
      fanSpeeds: {
        low: 'Basse',
        medium: 'Moyenne',
        high: 'Élevée',
        auto: 'Auto',
      },
      summary: {
        title: "Résumé de l'appareil",
        subtitle: "Mesures envoyées par l'appareil.",
        currentTemp: 'Température actuelle',
        power: 'Puissance',
        lastUpdated: 'Dernière mise à jour',
      },
      activity: {
        title: "Journal d'activité",
        subtitle: 'Mises à jour chronologiques de cet appareil.',
        empty: "Aucune activité pour l'instant.",
      },
    },
    zones: {
      title: 'Zones',
      subtitle: 'Gérez les pièces groupées avec des commandes globales et des statistiques rapides.',
      card: {
        deviceCount: '{count} appareils',
        activeDevices: '{count} actifs',
        avgBadge: 'Moy. {value} °C',
        energyBadge: '{value} kW',
        moreDevices: '+{count} appareils supplémentaires',
        noDevices: 'Aucun appareil dans cette zone',
      },
      actions: {
        turnAllOn: 'Tout allumer',
        turnAllOff: 'Tout éteindre',
      },
    },
    settings: {
      title: 'Paramètres',
      subtitle: 'Choisissez les sources de données et vos préférences opérationnelles.',
      apiConfig: {
        title: 'Configuration API',
        subtitle: 'Basculez entre les APIs locale, cloud ou simulée.',
        modeLabel: 'Mode',
        httpLabel: 'Point de terminaison HTTP',
        wsLabel: 'Point de terminaison WebSocket',
      },
      apiModes: {
        mock: 'API simulée',
        local: 'API locale',
        cloud: 'API cloud',
      },
      connection: {
        title: 'Statut de connexion',
        subtitle: 'Surveillez la fiabilité et reconnectez si besoin.',
        realtimeLink: 'Lien temps réel',
        restEndpoint: 'Endpoint REST',
      },
      actions: {
        reload: 'Recharger les données',
      },
      status: {
        refreshing: 'Actualisation des données…',
      },
    },
  },
}
