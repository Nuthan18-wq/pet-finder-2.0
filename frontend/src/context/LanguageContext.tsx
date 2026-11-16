import React, { createContext, useContext, useState } from 'react'

export type LanguageCode = 'en' | 'kn' | 'hi'

interface LanguageContextType {
  lang: LanguageCode
  setLang: (lang: LanguageCode) => void
  t: (key: string) => string
}

const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    findPets: 'Find Pets',
    liveMap: 'Live Map',
    shelters: 'Shelters & Vets',
    reunions: 'Reunion Stories',
    aiAssistant: 'AI Assistant',
    howItWorks: 'How It Works',
    myDashboard: 'My Dashboard',
    admin: 'Admin',
    logIn: 'Log In',
    signOut: 'Sign Out',
    createAccount: 'Create Account',
    heroTitle: 'A familiar face can lead them home.',
    heroSubtitle: 'AI-powered visual matching connects lost pets with the people who find them. Upload a photograph and let multimodal AI help reunite families.',
    iLostAPet: 'I Lost a Pet',
    iFoundAPet: 'I Found a Pet',
    lostReports: 'Lost Reports',
    foundReports: 'Found Reports',
    reunited: 'Pets Reunited',
    photoQualityTitle: 'AI Photo Quality Inspection',
    photoQualitySubtitle: 'Ensuring your photo produces the highest AI visual search accuracy',
    fingerprintTitle: 'AI Pet Visual Fingerprint',
    fingerprintNotice: 'This visual profile is synthesized by AI vision for comparative sorting; not a biological identity.',
    qrPoster: 'AI Poster Generator',
    generatePoster: 'Create Missing Pet Poster',
    downloadPoster: 'Download / Print Poster',
    sheltersTitle: 'Veterinary and Shelter Network',
    sheltersSubtitle: 'Find verified emergency animal hospitals, shelters, and microchip facilities nearby',
    reunionsTitle: 'Pet Reunification Tracker',
    reunionsSubtitle: 'Celebrating verified reunifications and community rescue stories',
    radiusFilter: 'Search Radius',
    allRadii: 'All Locations',
  },
  kn: {
    findPets: 'ಸಾಕುಪ್ರಾಣಿಗಳನ್ನು ಹುಡುಕಿ',
    liveMap: 'ಲೈವ್ ಮ್ಯಾಪ್',
    shelters: 'ಆಸ್ಪತ್ರೆಗಳು & ಆಶ್ರಯ ತಾಣಗಳು',
    reunions: 'ಮಿಲನ ಕಥೆಗಳು',
    aiAssistant: 'AI ಸಹಾಯಕ',
    howItWorks: 'ಇದು ಹೇಗೆ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ',
    myDashboard: 'ನನ್ನ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
    admin: 'ನಿರ್ವಾಹಕ',
    logIn: 'ಲಾಗಿನ್',
    signOut: 'ಸೈನ್ ಔಟ್',
    createAccount: 'ಖಾತೆ ತೆರೆಯಿರಿ',
    heroTitle: 'ಪರಿಚಿತ ಮುಖವು ಅವರನ್ನು ಮನೆಗೆ ತಲುಪಿಸುತ್ತದೆ.',
    heroSubtitle: 'ಕಳೆದುಹೋದ ಸಾಕುಪ್ರಾಣಿಗಳನ್ನು ಪತ್ತೆಹಚ್ಚಲು AI ದೃಶ್ಯ ಹೊಂದಾಣಿಕೆ ನೆರವಾಗುತ್ತದೆ. ಫೋಟೋ ಅಪ್ಲೋಡ್ ಮಾಡಿ, ನಿಮ್ಮ ಕುಟುಂಬದ ಮುದ್ದಿನ ಪ್ರಾಣಿಯನ್ನು ಮರಳಿ ಪಡೆಯಿರಿ.',
    iLostAPet: 'ನನ್ನ ಸಾಕುಪ್ರಾಣಿ ಕಳೆದುಹೋಗಿದೆ',
    iFoundAPet: 'ಸಾಕುಪ್ರಾಣಿ ಸಿಕ್ಕಿದೆ',
    lostReports: 'ಕಳೆದುಹೋದ ವರದಿಗಳು',
    foundReports: 'ಸಿಕ್ಕಿರುವ ವರದಿಗಳು',
    reunited: 'ಪುನರ್ಮಿಲನವಾದ ಪ್ರಾಣಿಗಳು',
    photoQualityTitle: 'AI ಫೋಟೋ ಗುಣಮಟ್ಟ ತಪಾಸಣೆ',
    photoQualitySubtitle: 'ನಿಮ್ಮ ಫೋಟೋ AI ಹುಡುಕಾಟಕ್ಕೆ ಸೂಕ್ತವಾಗಿದೆಯೇ ಎಂದು ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಿ',
    fingerprintTitle: 'AI ಸಾಕುಪ್ರಾಣಿ ದೃಶ್ಯ ಫಿಂಗರ್‌ಪ್ರಿಂಟ್',
    fingerprintNotice: 'ಇದು AI-ರಚಿತ ದೃಶ್ಯ ಪ್ರೊಫೈಲ್ ಆಗಿದೆ; ದೈಹಿಕ ಜೈವಿಕ ಗುರುತಿಸುವಿಕೆ ಅಲ್ಲ.',
    qrPoster: 'AI ಪೋಸ್ಟರ್ ಜನರೇಟರ್',
    generatePoster: 'ಕಳೆದುಹೋದ ಪೋಸ್ಟರ್ ರಚಿಸಿ',
    downloadPoster: 'ಪೋಸ್ಟರ್ ಡೌನ್‌ಲೋಡ್ / ಮುದ್ರಿಸಿ',
    sheltersTitle: 'ಪಶು ಆಸ್ಪತ್ರೆ ಮತ್ತು ಆಶ್ರಯ ಜಾಲ',
    sheltersSubtitle: 'ಹತ್ತಿರದ ಅಧಿಕೃತ ತುರ್ತು ಪಶು ಆಸ್ಪತ್ರೆಗಳು ಮತ್ತು ಆಶ್ರಯ ತಾಣಗಳನ್ನು ಹುಡುಕಿ',
    reunionsTitle: 'ಸಾಕುಪ್ರಾಣಿ ಪುನರ್ಮಿಲನ ಟ್ರ್ಯಾಕರ್',
    reunionsSubtitle: 'ಯಶಸ್ವಿ ಮಿಲನಗಳು ಮತ್ತು ಸಮುದಾಯ ರಕ್ಷಣಾ ಕಥೆಗಳ ಸಂಭ್ರಮ',
    radiusFilter: 'ಹುಡುಕಾಟ ವ್ಯಾಪ್ತಿ',
    allRadii: 'ಎಲ್ಲಾ ಸ್ಥಳಗಳು',
  },
  hi: {
    findPets: 'पालतू जानवर खोजें',
    liveMap: 'लाइव मैप',
    shelters: 'अस्पताल व शेल्टर',
    reunions: 'रीयूनियन कहानियाँ',
    aiAssistant: 'AI सहायक',
    howItWorks: 'यह कैसे काम करता है',
    myDashboard: 'मेरा डैशबोर्ड',
    admin: 'व्यवस्थापक',
    logIn: 'लॉग इन',
    signOut: 'साइन आउट',
    createAccount: 'खाता बनाएं',
    heroTitle: 'एक परिचित चेहरा उन्हें घर वापस ला सकता है।',
    heroSubtitle: 'खोए हुए पालतू जानवरों को खोजने के लिए AI आधारित विज़ुअल मैचिंग का उपयोग करें। एक फोटो अपलोड करें और परिवार को फिर से मिलाएं।',
    iLostAPet: 'मेरा पालतू जानवर खो गया है',
    iFoundAPet: 'मुझे पालतू जानवर मिला है',
    lostReports: 'खोए हुए की रिपोर्ट',
    foundReports: 'मिले हुए की रिपोर्ट',
    reunited: 'पुनर्मिलन हुए पालतू',
    photoQualityTitle: 'AI फोटो गुणवत्ता जांच',
    photoQualitySubtitle: 'सटीक AI मिलान के लिए आपकी तस्वीर की स्पष्टता की पुष्टि',
    fingerprintTitle: 'AI विज़ुअल फिंगरप्रिंट',
    fingerprintNotice: 'यह विज़ुअल प्रोफ़ाइल AI दृष्टि द्वारा केवल तुलनात्मक छँटाई के लिए तैयार की गई है; यह जैविक प्रमाण नहीं है।',
    qrPoster: 'AI पोस्टर जनरेटर',
    generatePoster: 'गुमशुदगी पोस्टर बनाएं',
    downloadPoster: 'पोस्टर डाउनलोड / प्रिंट करें',
    sheltersTitle: 'पशु चिकित्सालय व शेल्टर नेटवर्क',
    sheltersSubtitle: 'निकटवर्ती सत्यापित आपातकालीन पशु अस्पताल व शेल्टर खोजें',
    reunionsTitle: 'पालतू पुनर्मिलन ट्रैकर',
    reunionsSubtitle: 'सफल पुनर्मिलन और समुदाय की प्रेरणादायक कहानियाँ',
    radiusFilter: 'खोज का दायरा',
    allRadii: 'सभी स्थान',
  },
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key: string) => key,
})

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<LanguageCode>(() => {
    return (localStorage.getItem('petfinder-lang') as LanguageCode) || 'en'
  })

  const setLang = (newLang: LanguageCode) => {
    localStorage.setItem('petfinder-lang', newLang)
    setLangState(newLang)
  }

  const t = (key: string): string => {
    return translations[lang]?.[key] || translations.en[key] || key
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
