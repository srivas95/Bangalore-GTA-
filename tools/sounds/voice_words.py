# Word list for build_voices.py: Lingua Libre recordings used for street dialogue.
# word (native script) -> (romanisation, English meaning)
KN = {
    'ಬನ್ನಿ': ('banni', 'come (polite) / come in'), 'ನಿಲ್ಲಿಸಿ': ('nillisi', 'stop (polite)'), 'ಇಲ್ಲಿ': ('illi', 'here'),
    'ಅಲ್ಲಿ': ('alli', 'there'), 'ಸರಿ': ('sari', 'okay / right'), 'ಹೌದು': ('houdu', 'yes'), 'ಇಲ್ಲ': ('illa', 'no / there is none'),
    'ಏನು': ('enu', 'what'), 'ಹೋಗಿ': ('hogi', 'go (polite)'), 'ಧನ್ಯವಾದಗಳು': ('dhanyavadagalu', 'thank you'),
    'ಧನ್ಯವಾದ': ('dhanyavada', 'thanks'), 'ದಯವಿಟ್ಟು': ('dayavittu', 'please'), 'ಕ್ಷಮಿಸಿ': ('kshamisi', 'sorry / excuse me'),
    'ಎಲ್ಲಿ': ('elli', 'where'), 'ನೋಡಿ': ('nodi', 'look'), 'ಹೇ': ('he', 'hey'), 'ಈಗ': ('iga', 'now'),
    'ಸ್ವಲ್ಪ': ('swalpa', 'a little (as in "swalpa adjust maadi")'), 'ದಾರಿ': ('daari', 'way / road'),
    'ಮಾಡಬೇಡಿ': ('madabedi', "don't (do that)"), 'ನಿರೀಕ್ಷಿಸಿ': ('nirikshisi', 'wait'), 'ಬೇಕು': ('beku', 'want / need'),
    'ಏಕೆ': ('eke', 'why'), 'ಉಹ್': ('uh', 'uh (hesitation)'), 'ಹೊರಗೆ': ('horage', 'outside'), 'ತುಂಬಾ': ('tumba', 'very / a lot'),
    'ಒಂದು': ('ondu', 'one'), 'ಎರಡು': ('eradu', 'two'), 'ಹೇಳಿ': ('heli', 'tell (me)'), 'ಮತ್ತೆ': ('matte', 'again'),
    'ನಮಸ್ಕಾರ': ('namaskara', 'hello / greetings'), 'ಹಣ': ('hana', 'money'), 'ಬಿಡಿ': ('bidi', 'leave it / let go'),
    'ಓಹ್': ('oh', 'oh!'), 'ಅಣ್ಣ': ('anna', 'elder brother (how people address an auto driver)'), 'ಬೆಂಗಳೂರು': ('bengaluru', 'Bengaluru'),
    'ಬೆಂಕಿ': ('benki', 'fire!'), 'ಹತ್ತು': ('hattu', 'ten'), 'ಇಪ್ಪತ್ತು': ('ippattu', 'twenty'),
    'ನನಗೆ ಸಹಾಯ ಮಾಡಿ': ('nanage_sahaya_madi', 'help me!'),
}
HI = {
    'कहाँ': ('kahan', 'where'), 'नहीं': ('nahin', 'no'), 'क्या': ('kya', 'what'), 'यहाँ': ('yahan', 'here'), 'वहाँ': ('vahan', 'there'),
    'अच्छा': ('accha', 'okay / good'), 'सही': ('sahi', 'right / correct'), 'आग': ('aag', 'fire!'), 'थोड़ा': ('thoda', 'a little'),
    'बहुत': ('bahut', 'very / a lot'), 'दूर': ('door', 'far'), 'हाँ': ('haan', 'yes'), 'भाई': ('bhai', 'brother'),
    'पैसा': ('paisa', 'money'), 'नमस्ते': ('namaste', 'hello'), 'पुलिस': ('police', 'police'), 'धन्यवाद': ('dhanyavaad', 'thank you'),
    'चोर': ('chor', 'thief!'), 'ठीक': ('theek', 'fine / okay'), 'टिकट': ('tikat', 'ticket'),
    'यार': ('yaar', 'buddy / mate'), 'चाचा': ('chacha', 'uncle (addressing an older man)'), 'आराम': ('aaram', 'rest / easy ("aaram se" = take it easy)'),
    'मिनट': ('minute', 'minute ("ek minute" = one moment)'), 'जगह': ('jagah', 'place / room'), 'बीस': ('bees', 'twenty'),
    'पचास': ('pachaas', 'fifty'), 'सौ': ('sau', 'hundred'),
    'किराया': ('kiraya', 'fare'), 'सब्ज़ी': ('sabzi', 'vegetables (vendor call)'), 'शुक्रिया': ('shukriya', 'thanks'),
}
# Lingua Libre speaker -> (key letter, gender from the speaker's Lingua Libre profile; Shruthi D S has none
# there, so hers is estimated from pitch, median ~235 Hz)
SPEAKERS = {
    'Ashoka KG': ('a', 'male'), 'Shilpa Bhat N H': ('s', 'female'), 'Shruthi D S': ('d', 'female'), 'AnshulBhagwat': ('b', 'male'),
    'AryamanA': ('a', 'male'), 'EditorFX': ('e', 'female'), 'QueerEcofeminist': ('q', 'male'),
    'Sriveenkat': ('v', 'male'), 'Mauryaar': ('m', 'male'), 'Medhi jyoti': ('j', 'female'), 'ATallSteve': ('t', 'male'),
}
