import { Book } from './types';

export const books: Book[] = [{
    id: 1,
    title: "Pride and Prejudice",
    author: "Jane Austen",
    reads: "1.2M reads",
    coverColor: "bg-amber-100",
    quote: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
    tags: ["Classic Literature", "Romance", "Social Satire"],
    chapters: [
        {
            id: 1,
            title: "A Purpose for a Bachelor",
            summary: "I must begin by confessing that the arrival of a wealthy bachelor at Netherfield Park has quite unhinged the peace of Longbourn. Mrs. Bennet, whose mind is singularly fixed on the marriage of her daughters, is convinced that Mr. Bingley is the answer to her every hope.",
            pages: [
                { id: 1, summary: "I find it necessary to mention that in our neighborhood, a man of fortune is considered the rightful property of someone’s daughter. Mrs. Bennet informs her husband that Netherfield is let at last to a young man from the north of England. She is insistent that Mr. Bennet must visit him, for the sake of their five daughters, though he answers her with a most teasing indifference." },
                { id: 2, summary: "The dynamic of the Bennet household is established through this initial disagreement. Mr. Bennet finds his solace in a sarcastic humor that his wife, a woman of mean understanding and uncertain temper, is quite unable to comprehend. He suggests she send the girls alone, or perhaps go herself, as she is as handsome as any of them—a remark that does little to soothe her self-proclaimed poor nerves." }
            ],
            likes: 4500,
            bookmarks: 890
        },
        {
            id: 2,
            title: "The Neighborly Duty",
            summary: "Mr. Bennet is a man who takes great pleasure in being delayed in his disclosures. While the house remained in a state of fretful uncertainty, he had already performed the very task his wife so loudly demanded, though he chose a most roundabout way to reveal it.",
            pages: [
                { id: 1, summary: "Mr. Bennet was among the earliest to wait on Mr. Bingley, yet he allowed his family to believe he had no such intention. He eventually discloses the visit by addressing Kitty’s ill-timed cough and observing Elizabeth’s hat-trimming, before casually mentioning his acquaintance with the gentleman. The surprise of the ladies was exactly what he wished to achieve." },
                { id: 2, summary: "Mrs. Bennet’s resentment is instantly transformed into rapture. She declares her husband to be a most excellent father, though only moments before she had complained of his lack of compassion. The evening is then spent in a state of high spirits, as they conjecture how soon the visit will be returned and when they might properly ask Mr. Bingley to dinner." }
            ],
            likes: 3200,
            bookmarks: 540
        },
        {
            id: 3,
            title: "The Assembly at Meryton",
            summary: "Our first meeting with the Netherfield party took place at the local ball. While Mr. Bingley proved himself to be a man of easy and unaffected manners, his friend Mr. Darcy brought a coldness to the room that no amount of fortune could justify.",
            pages: [
                { id: 1, summary: "The neighborhood is soon satisfied with Mr. Bingley, who is young, handsome, and remarkably agreeable. However, the same cannot be said for Mr. Darcy. Though his fine person and ten thousand a year initially drew great admiration, his haughty behavior soon turned the tide of popularity. He was discovered to be above his company and quite impossible to please." },
                { id: 2, summary: "The most unfortunate event of the evening occurred when Mr. Bingley urged Darcy to dance. Darcy, looking toward Elizabeth Bennet, remarked that she was 'tolerable, but not handsome enough to tempt' him. Elizabeth overheard this slight, and I must say her spirit is such that she found the man's arrogance more amusing than hurtful, later sharing the story with great humor." },
                { id: 3, summary: "Despite the insult to Elizabeth, the night was a triumph for Jane, who danced with Mr. Bingley twice. Mrs. Bennet returned home in a state of great satisfaction, dwelling on the beauty of the Netherfield party’s lace and the success of her eldest daughter, while maintaining a very vocal resentment toward the pride of Mr. Darcy." }
            ],
            likes: 5100,
            bookmarks: 1200
        },
        {
            id: 4,
            title: "Private Observations",
            summary: "When the lights of the ball were extinguished and the sisters were alone, the difference in their temperaments became truly clear. Jane’s readiness to think well of everyone is a sweetness that Elizabeth finds both admirable and slightly alarming.",
            pages: [
                { id: 1, summary: "In the quiet of their chamber, Jane confesses to Elizabeth how very much she admires Mr. Bingley. She finds him to be everything a young man ought to be. Elizabeth agrees that he is a fine fellow, but she chides her sister for being 'honestly blind' to the follies of others. Elizabeth is far less inclined to like Bingley’s sisters, perceiving them to be proud and conceited." },
                { id: 2, summary: "We learn that the Bingley siblings are of a respectable family from the north, though their fortune was acquired by trade—a fact they are not eager to dwell upon. They are fine ladies with an air of decided fashion, yet they possess a superciliousness that contrasts sharply with their brother's openness. This private discussion sets the stage for the social difficulties to come." }
            ],
            likes: 2800,
            bookmarks: 430
        },
        {
            id: 5,
            title: "The Question of Status",
            summary: "A visit with our neighbors, the Lucases, allowed for a thorough dissection of the assembly. The conversation turned to the nature of pride, and whether a man of Mr. Darcy's immense standing is perhaps entitled to his high opinion of himself.",
            pages: [
                { id: 1, summary: "The Bennets and the Lucases meet to share their observations. Charlotte Lucas, Elizabeth's intimate friend, suggests that Mr. Darcy has a right to be proud given his family, fortune, and position. Elizabeth, however, offers a very sensible rebuttal, noting that she could easily forgive his pride if he had not mortified her own." },
                { id: 2, summary: "Mary Bennet offers a pedantic observation on the distinction between pride and vanity, suggesting that one may be proud without being vain. While the elders discuss the dignity of rank, the younger girls, Catherine and Lydia, can think of nothing but the arrival of a militia regiment in Meryton, which promises a winter of new acquaintances." }
            ],
            likes: 3400,
            bookmarks: 610
        },
        {
            id: 6,
            title: "A Change in Scrutiny",
            summary: "I must inform you of a most curious development. Mr. Darcy, who previously found Elizabeth merely tolerable, has begun to find her uncommonly intelligent. He has started to watch her with an interest she is quite far from suspecting.",
            pages: [
                { id: 1, summary: "Darcy had initially looked at Elizabeth only to criticize, but he soon finds that the beautiful expression of her dark eyes renders her face uncommonly intelligent. He begins to notice the lightness of her figure and is caught by her easy playfulness. Elizabeth remains unaware, still viewing him as the man who made himself disagreeable to everyone at the ball." },
                { id: 2, summary: "At a gathering at Sir William Lucas's, Elizabeth is persuaded to play the piano. Darcy listens, and when Sir William attempts to join their hands for a dance, Elizabeth refuses with a spirited archness. Her resistance only increases her value in Darcy's eyes, even as Miss Bingley begins to suspect his change of heart and treats Elizabeth with a new, jealous scrutiny." },
                { id: 3, summary: "Miss Bingley attempts to mock Darcy’s interest in the 'fine eyes' of Miss Elizabeth Bennet, but Darcy answers her with a firmness that leaves her quite astonished. She attempts to draw him into a critique of the Bennets' low connections, hoping to dampen his admiration, but he remains steadfast in his silent observation of Elizabeth's character." }
            ],
            likes: 4200,
            bookmarks: 980
        },
        {
            id: 7,
            title: "A Calculated Exposure",
            summary: "The arrival of the militia has brought much animation to Meryton, but it is Mrs. Bennet's newest scheme that has caused the most significant trouble. By denying Jane the carriage for a visit to Netherfield, she has placed her daughter’s health at risk for the sake of a longer stay.",
            pages: [
                { id: 1, summary: "Jane receives an invitation to dine with the Bingley sisters. Sensing an approaching storm, Mrs. Bennet insists that Jane go on horseback rather than in the carriage, specifically so she will be forced to stay the night. The plan is a success of the most unfortunate kind, as Jane arrives soaked and falls ill with a violent cold." },
                { id: 2, summary: "A note arrives from Jane the next morning, informing the family of her illness and her inability to return home. Elizabeth, genuinely anxious for her sister, resolves to go to her. As the carriage is in use and she is no horsewoman, she decides to walk the three miles to Netherfield across the muddy fields." },
                { id: 3, summary: "Elizabeth sets off with a motive that outweighs any concern for her own appearance. She is accompanied part of the way by her younger sisters, who are eager for news of the officers in Meryton. Elizabeth continues alone, arriving at the Bingley estate with weary ankles and dirty stockings, much to the surprise of the household." }
            ],
            likes: 3100,
            bookmarks: 520
        },
        {
            id: 8,
            title: "The Guest at Netherfield",
            summary: "Elizabeth's arrival at Netherfield in a state of disarray was viewed as a total lack of decorum by the ladies of the house. However, to Mr. Darcy, the brilliance her complexion gained from the exercise was quite impossible to ignore.",
            pages: [
                { id: 1, summary: "Elizabeth is received with a politeness that masks the contempt of Mrs. Hurst and Miss Bingley. They find her muddy appearance nearly incredible. However, Bingley is only concerned for Jane’s welfare, and Darcy is divided between admiration for Elizabeth’s spirit and a doubt as to whether the occasion justified her coming so far alone." },
                { id: 2, summary: "Jane is found to be too feverish to leave her room, and Elizabeth is invited to remain at Netherfield to care for her. At dinner, Elizabeth is forced to sit with the party. Mr. Hurst is preoccupied with his food, while the sisters indulge in a subtle mockery of Elizabeth’s family and their lack of social consequence." },
                { id: 3, summary: "When Elizabeth leaves the room, the Bingley sisters openly attack her manners and her appearance. They laugh at her 'wild' look and her petticoat 'six inches deep in mud.' Darcy, when pressed for his opinion, admits he noticed the mud but maintains that her eyes were brightened by the exercise, showing he is no longer entirely on his guard." }
            ],
            likes: 4600,
            bookmarks: 1100
        },
        {
            id: 9,
            title: "The Interrogation",
            summary: "Mrs. Bennet has visited Netherfield to see Jane, and I must confess, her lack of propriety was on full display. She attempted to defend the merits of country life against Mr. Darcy, quite unaware of the poor impression she was making on her daughter's behalf.",
            pages: [
                { id: 1, summary: "Mrs. Bennet, accompanied by her younger daughters, arrives to check on Jane. She is pleased to find the illness is not dangerous, as it ensures Jane remains at Netherfield. She proceeds to embarrass Elizabeth by arguing with Darcy about the variety of country society, boasting that they dine with twenty-four different families." },
                { id: 2, summary: "The visit highlights the vast gap in manners. Mrs. Bennet mentions a former admirer of Jane’s just to provoke Mr. Bingley's interest. Elizabeth is in agony, watching Darcy's silent, composed contempt. Before departing, Lydia reminds Bingley of his promise to give a ball, which he graciously reaffirms for a future date." }
            ],
            likes: 2900,
            bookmarks: 400
        },
        {
            id: 10,
            title: "The Merit of Reading",
            summary: "An evening in the Netherfield drawing room provided a most spirited debate on the nature of an accomplished woman. While Miss Bingley sought to flatter Mr. Darcy, Elizabeth used her wit to challenge his impossibly high standards.",
            pages: [
                { id: 1, summary: "The evening is occupied by Darcy writing a letter to his sister. Miss Bingley offers a constant stream of empty praise for his penmanship and the speed of his writing. Darcy’s replies are dry and brief, showing his lack of interest in her flattery. Elizabeth sits nearby, observing the scene with her usual keen discernment." },
                { id: 2, summary: "The conversation turns to what constitutes an 'accomplished' woman. Darcy adds to the general list of skills the 'improvement of her mind by extensive reading.' Elizabeth laughs at this, suggesting that if such are his requirements, he must know very few women who deserve the title. It is a moment of sharp, intellectual sparks." },
                { id: 3, summary: "Darcy is increasingly caught by Elizabeth's easy playfulness. He begins to feel the danger of paying her too much attention, as his social position makes such an attraction most inconvenient. He resolves to be more reserved, yet he cannot help but continue to find her the most interesting object in the room." }
            ],
            likes: 4800,
            bookmarks: 1300
        },
        {
            id: 11,
            title: "The Sparring over Coffee",
            summary: "Jane is at last well enough to join the company downstairs, but her presence, though a delight to Mr. Bingley, does little to calm the intellectual friction between Elizabeth and Mr. Darcy. Their conversation has taken a turn toward the nature of personal defects.",
            pages: [
                { id: 1, summary: "When the ladies remove to the drawing-room after dinner, Jane is greeted with a warmth from Mr. Bingley that speaks of a heart quite untouched by time or distance. Elizabeth, meanwhile, finds herself observing Mr. Darcy and Miss Bingley. The latter's attempts to secure Darcy’s attention are so transparent that they afford Elizabeth a quiet amusement, particularly as Darcy seems more interested in Elizabeth’s own silent observations." },
                { id: 2, summary: "A discussion ensues regarding Darcy's character. He admits to a 'resentful temper' and states that his good opinion, once lost, is lost forever. Elizabeth, with a spirit that refuses to be intimidated, remarks that his defect is a 'propensity to hate everybody,' to which he replies that hers is 'willfully to misunderstand them.' Darcy begins to feel the peril of his attraction and resolves to be more guarded in his civility." }
            ],
            likes: 3100,
            bookmarks: 420
        },
        {
            id: 12,
            title: "The Relief of Departure",
            summary: "The visit to Netherfield concludes with a quiet departure. While Mrs. Bennet is disappointed that the match was not secured in a single week, Mr. Darcy is most relieved to see Elizabeth go, for her presence has become a threat to his peace of mind.",
            pages: [
                { id: 1, summary: "Elizabeth and Jane return to Longbourn in a borrowed carriage, as their mother had hoped to force a longer stay by denying them their own. The parting is civil, though the Bingley sisters are clearly ready to have their home returned to its usual state. Darcy, however, is the most satisfied of all to see them depart; he has spent the final days of their visit in a state of studied silence to hide his growing admiration." },
                { id: 2, summary: "Upon arriving home, they find their mother in a state of ill-humor over their early return, and their younger sisters, Kitty and Lydia, full of news concerning the militia. Mr. Bennet, though laconic in his welcome, is genuinely glad to have Elizabeth back, as her sense is the only thing that renders the family conversation endurable to him." }
            ],
            likes: 2400,
            bookmarks: 310
        },
        {
            id: 13,
            title: "A Cousin of Singular Character",
            summary: "Mr. Bennet has informed us of an impending visit from his cousin, Mr. Collins. As the heir to the Longbourn estate, his arrival is a matter of great importance, though his letter of introduction suggests a mind of the most peculiar and pompous composition.",
            pages: [
                { id: 1, summary: "Mr. Bennet shares a letter from Mr. Collins, a clergyman who enjoys the patronage of Lady Catherine de Bourgh. The letter is a masterpiece of formal servility and self-importance. Collins expresses a desire to 'heal the breach' caused by the entailment of the estate, a sentiment Elizabeth finds to be an extraordinary mixture of pride and obsequiousness." },
                { id: 2, summary: "Mr. Collins arrives and proves to be exactly as his writing suggested. He is a tall, heavy-looking young man with manners of the most rigid formality. He is quick to compliment Mrs. Bennet on her daughters and the dinner, though he nearly offends her by assuming the girls were involved in the kitchen—a suggestion she corrects with some asperity." }
            ],
            likes: 2900,
            bookmarks: 450
        },
        {
            id: 14,
            title: "The Patroness and the Parson",
            summary: "The evening was spent in a thorough exploration of Mr. Collins’s world. His devotion to Lady Catherine de Bourgh is so absolute that it borders on the absurd. Mr. Bennet find great pleasure in encouraging the man’s follies, to the quiet mortification of his elder daughters.",
            pages: [
                { id: 1, summary: "Mr. Collins speaks at length of the grandeur of Rosings Park and the 'affability' of Lady Catherine. He describes her as a woman of great discernment who has been kind enough to approve of his sermons and even suggest he find a wife. He speaks of her daughter, Miss de Bourgh, with a level of reverence usually reserved for royalty." },
                { id: 2, summary: "Mr. Bennet, realizing his cousin is an absolute 'oddity,' amuses himself by drawing out Collins’s most ridiculous opinions. Elizabeth is struck by how a man can be so humble toward his superiors yet so arrogant toward his equals. After dinner, Collins refuses to read a novel, choosing instead to read a book of sermons with a 'monotonous solemnity' that Lydia is unable to endure in silence." }
            ],
            likes: 2100,
            bookmarks: 280
        },
        {
            id: 15,
            title: "The Encounter in Meryton",
            summary: "A walk to Meryton has introduced a new figure to our circle: Mr. Wickham. He is a man of most pleasing appearance and manners, yet his first meeting with Mr. Darcy was marked by a coldness that speaks of a dark and shared history.",
            pages: [
                { id: 1, summary: "Mr. Collins reveals his true purpose: he intends to marry one of the Bennet sisters to keep the estate in the family. He initially chooses Jane, but after a subtle hint from Mrs. Bennet that Jane is likely to be soon engaged to Bingley, he transfers his 'affections' to Elizabeth with a speed that highlights his lack of genuine feeling." },
                { id: 2, summary: "The party walks to Meryton and is introduced to Mr. Wickham, a handsome and personable new officer. While they are conversing, Darcy and Bingley ride by. Elizabeth watches as Darcy and Wickham catch sight of each other; one turns white and the other red. It is a moment of unmistakable tension, leaving Elizabeth with a burning curiosity to know the cause of such mutual dislike." }
            ],
            likes: 4200,
            bookmarks: 980
        },
        {
            id: 16,
            title: "The History of a Grievance",
            summary: "At a party at the Phillipses’, Mr. Wickham has taken Elizabeth into his confidence. He shares a tale of suffering and injustice at the hands of Mr. Darcy, which confirms every prejudice Elizabeth has ever harbored against the master of Pemberley.",
            pages: [
                { id: 1, summary: "Wickham, with a 'happy readiness of conversation,' explains his connection to the Darcy family. He claims that the late Mr. Darcy was his godfather and intended to provide for him in the church, but that the younger Darcy, out of jealousy, disregarded his father's will and left Wickham in a state of poverty. Elizabeth is horrified and finds her dislike of Darcy fully justified." },
                { id: 2, summary: "Elizabeth is further intrigued by Wickham’s description of Darcy’s pride. He explains that Darcy’s apparent virtues are merely the result of family pride and a desire to maintain the reputation of Pemberley. He also reveals that Lady Catherine de Bourgh is Darcy’s aunt and that a marriage is expected between Darcy and her daughter, a prospect Elizabeth finds quite fitting for two such arrogant families." }
            ],
            likes: 3800,
            bookmarks: 850
        },
        {
            id: 17,
            title: "Wait and Hope",
            summary: "Jane, in her sweet nature, attempts to find a way to reconcile Wickham’s story with Darcy’s reputation, but Elizabeth remains steadfast in her belief. The family now looks forward to the Netherfield ball, where Elizabeth expects to see Mr. Wickham triumph.",
            pages: [
                { id: 1, summary: "Elizabeth recounts Wickham’s story to Jane, who is distressed by the news. Jane’s primary concern is that a man of Mr. Bingley’s good character would not be friends with a man as wicked as Wickham describes Darcy to be. She suggests there must be a misunderstanding, but Elizabeth dismisses this as Jane’s usual inability to see fault in anyone." },
                { id: 2, summary: "An invitation arrives for a ball at Netherfield. Elizabeth is in high spirits, anticipating a dance with Mr. Wickham and the opportunity to show Mr. Darcy her contempt. However, her pleasure is dampened when Mr. Collins solicits her for the first two dances. She realizes with a sinking heart that he is now officially courting her." }
            ],
            likes: 2200,
            bookmarks: 390
        },
        {
            id: 18,
            title: "Disaster at the Ball",
            summary: "The ball at Netherfield was a trial of the most mortifying kind. Mr. Wickham was absent, Elizabeth was forced to dance with Mr. Darcy, and the behavior of her family was such that it seemed to justify every cold judgment Darcy ever made.",
            pages: [
                { id: 1, summary: "Elizabeth arrives to find that Wickham has stayed away to avoid Darcy. Disappointed, she is caught off guard when Darcy himself asks her to dance. She accepts out of sheer surprise. Their dance is a battle of wits and silence; Elizabeth attempts to provoke him by mentioning Wickham, but Darcy remains controlled, though clearly displeased by the subject." },
                { id: 2, summary: "The evening proceeds from one embarrassment to another. Mr. Collins introduces himself to Darcy without a proper introduction, a social blunder of the highest order. Mrs. Bennet speaks loudly of the probability of Jane’s marriage to Bingley within Darcy’s hearing. Mary insists on singing with more zeal than talent, and Mr. Bennet eventually stops her with a public and cutting remark." },
                { id: 3, summary: "By the end of the evening, Elizabeth is overwhelmed by the 'total want of propriety' shown by her family. She sees that Darcy and the Bingley sisters look upon them with unmistakable contempt. She feels for Jane, whose happiness seems at risk from the very people who should be protecting her reputation." }
            ],
            likes: 5400,
            bookmarks: 1500
        },
        {
            id: 19,
            title: "An Absurd Proposal",
            summary: "Mr. Collins has at last made his declaration. It was as formal and as ridiculous as the man himself, and he has shown a singular inability to accept that a woman might actually refuse his hand.",
            pages: [
                { id: 1, summary: "Mr. Collins corners Elizabeth and lists his reasons for marrying: it is the duty of a clergyman, it will add to his happiness, and it was suggested by Lady Catherine. He tells Elizabeth that her small fortune makes it likely she will never receive another offer and that he is doing her a great kindness. Elizabeth rejects him with a firmness that leaves no room for doubt." },
                { id: 2, summary: "Despite her clear 'no,' Collins insists that it is the custom of 'elegant females' to reject a man at first to increase his affection. He believes himself to be so desirable a match that her refusal cannot be sincere. Elizabeth is forced to be increasingly blunt, yet he remains convinced that her parents will eventually force her to accept him." }
            ],
            likes: 4100,
            bookmarks: 1100
        },
        {
            id: 20,
            title: "The Unhappy Alternative",
            summary: "The house is in a state of civil war over the proposal. While Mrs. Bennet threatens to never see Elizabeth again if she refuses, Mr. Bennet has offered a counter-threat that has finally secured Elizabeth’s freedom.",
            pages: [
                { id: 1, summary: "Mrs. Bennet is in a frenzy of despair and calls on Mr. Bennet to command Elizabeth’s obedience. Mr. Bennet calls Elizabeth into his library and delivers his famous judgment: 'An unhappy alternative is before you, Elizabeth. From this day you must be a stranger to one of your parents. Your mother will never see you again if you do NOT marry Mr. Collins, and I will never see you again if you DO.'" },
                { id: 2, summary: "Elizabeth is saved, but the atmosphere at Longbourn remains tense. Mrs. Bennet continues to lament her daughter’s 'perverseness,' while Mr. Collins begins to withdraw his suit with a wounded pride that he attempts to mask as Christian resignation. He stays at the house, but his attentions are already shifting elsewhere." }
            ],
            likes: 3600,
            bookmarks: 720
        },
        {
            id: 21,
            title: "The Silent House",
            summary: "A most distressing silence has fallen over Netherfield. Mr. Bingley and his sisters have departed for London, leaving Jane in a state of quiet suffering and Elizabeth in a state of righteous indignation against those she believes have engineered this separation.",
            pages: [
                { id: 1, summary: "Jane receives a letter from Caroline Bingley, which confirms that the entire party has left for town with no intention of returning. The letter is filled with praises for Miss Darcy, suggesting a hope that she and Mr. Bingley might be united. Jane, with her characteristic lack of guile, tries to believe the best of her friend, but Elizabeth is convinced that the sisters and Mr. Darcy are working together to keep Bingley away from a connection they deem inferior." },
                { id: 2, summary: "The departure of the Netherfield party leaves the neighborhood dull, but Mr. Wickham’s presence remains a source of interest. He shares his grievances more openly now that Darcy is gone, and Elizabeth finds herself a sympathetic listener. The chapter concludes with the realization that Jane's happiness has been trifled with, a thought that only deepens Elizabeth's prejudice against the master of Pemberley." }
            ],
            likes: 2100,
            bookmarks: 320
        },
        {
            id: 22,
            title: "A Marriage of Reason",
            summary: "You will, I fear, find this turn of events most unsatisfactory. Charlotte Lucas, in a move of calculated pragmatism, has accepted the hand of Mr. Collins. Elizabeth is quite unable to reconcile her friend's good sense with a choice so clearly devoid of affection.",
            pages: [
                { id: 1, summary: "The morning after his disappointment with Elizabeth, Mr. Collins hastens to Lucas Lodge to offer himself to Charlotte. Charlotte, who is twenty-seven and possesses a very small fortune, accepts him immediately. She views marriage as a social necessity—a 'preservative from want'—and is willing to overlook the man's pompous nature for the sake of a home and a respectable position in society." },
                { id: 2, summary: "Charlotte manages the business with such 'admirable slyness' that Elizabeth remains entirely ignorant of the engagement for a full day. Charlotte knows that Elizabeth will judge her, yet she is satisfied with her success. Mr. Collins is in a state of high self-gratulation, having secured a wife within days of his first refusal, thereby proving his desirability to himself and his patroness." }
            ],
            likes: 3800,
            bookmarks: 940
        },
        {
            id: 23,
            title: "The Neighborhood Flutter",
            summary: "The announcement of the engagement has thrown Longbourn into a state of the most vocal disbelief. Mrs. Bennet is quite beyond the reach of reason, and Elizabeth feels a painful loss of confidence in the friend she thought she knew so well.",
            pages: [
                { id: 1, summary: "Sir William Lucas arrives to share the news of his daughter's impending marriage. Mrs. Bennet is at first incredulous and then violently resentful, accusing the Lucases of being artful and predicting that Jane and Bingley would have been married if not for such interference. Elizabeth is forced to confirm the news, though she does so with a heavy heart." },
                { id: 2, summary: "Elizabeth and Charlotte have a conversation that marks the end of their previous intimacy. Charlotte defends her choice by stating she is 'not romantic' and only desires a comfortable home. Elizabeth finds it impossible to understand how a woman of such understanding could marry a man like Mr. Collins. Meanwhile, Jane’s sadness continues as she receives no further news from Netherfield." }
            ],
            likes: 2900,
            bookmarks: 510
        },
        {
            id: 24,
            title: "Jane’s Resignation",
            summary: "The arrival of another letter from Caroline Bingley has extinguished the last spark of hope for Jane. While Jane resolves to be happy in her own way, Elizabeth remains fixed in her belief that Mr. Darcy is the primary architect of her sister's misery.",
            pages: [
                { id: 1, summary: "Caroline's letter confirms that they are settled in London for the winter. It is now clear, even to Jane, that the 'friendship' was a mere social convenience. Elizabeth watches her sister's quiet struggle and feels a renewed hatred for the 'proud' Mr. Darcy, whom she holds responsible for influencing Mr. Bingley's decisions. Jane, however, refuses to speak ill of anyone." },
                { id: 2, summary: "Mr. Bennet’s response to the situation is to tease Elizabeth about her own prospects, suggesting that it is her turn to be jilted by Mr. Wickham. He finds a cynical amusement in the follies of the neighborhood. The chapter ends with a sense of stagnation at Longbourn, as the girls look forward to the arrival of their aunt and uncle for the Christmas holidays." }
            ],
            likes: 2200,
            bookmarks: 430
        },
        {
            id: 25,
            title: "The Sensible Relatives",
            summary: "The arrival of the Gardiners provides a much-needed relief from the volatility of the Bennet household. Mrs. Gardiner, a woman of great sense and elegance, immediately perceives the state of Jane’s heart and offers a most timely invitation.",
            pages: [
                { id: 1, summary: "Mr. Gardiner is a gentleman of trade from London, but his manners are such that he would put many of Meryton’s 'gentlemen' to shame. His wife, Mrs. Gardiner, is a confidante to Elizabeth and Jane. She listens to Mrs. Bennet’s complaints about the Lucases and the Bingleys with a patient, yet discerning, ear, while focusing her true concern on Jane's pale countenance." },
                { id: 2, summary: "Mrs. Gardiner proposes that Jane return to London with them for the winter to seek a change of scene. She hopes that the city will distract Jane from her thoughts of Mr. Bingley. Elizabeth is overjoyed at the prospect, though she remains skeptical that Jane will meet with any kindness from the Bingley sisters should they encounter one another in town." }
            ],
            likes: 2500,
            bookmarks: 380
        },
        {
            id: 26,
            title: "A Warning and a Wedding",
            summary: "I must share a motherly caution that was given to Elizabeth regarding Mr. Wickham. While Jane departs for London to face her own trials, Elizabeth is left to observe a shift in Mr. Wickham’s attentions that is quite as mercenary as it is sudden.",
            pages: [
                { id: 1, summary: "Mrs. Gardiner warns Elizabeth not to fall in love with Wickham, as his lack of fortune makes a match between them a matter of great imprudence. Elizabeth, with her usual self-assurance, promises not to be in a hurry to lose her heart. Soon after, Charlotte and Mr. Collins are married, and Elizabeth prepares herself for a visit to Kent in the spring." },
                { id: 2, summary: "Jane writes from London of her cold reception by Caroline Bingley, finally realizing that she was never truly valued. Meanwhile, Wickham’s 'affections' shift to a Miss King, who has recently inherited ten thousand pounds. Elizabeth is surprised to find herself more indifferent to this than she expected, concluding that her heart was perhaps not as involved as her vanity." }
            ],
            likes: 3100,
            bookmarks: 620
        },
        {
            id: 27,
            title: "The Journey to Kent",
            summary: "March has arrived, and with it, Elizabeth’s journey to visit the new Mrs. Collins. She finds a brief respite in London with the Gardiners, where she finds Jane steady but still quiet, and the two sisters discuss the curious inconsistency of the world.",
            pages: [
                { id: 1, summary: "Elizabeth travels to London with Sir William Lucas and his younger daughter. She finds Jane looking well, but Mrs. Gardiner privately informs her that Jane is still prone to periods of dejection. Elizabeth remains convinced that Darcy is the cause of all this suffering, a prejudice she carries with her as she moves toward his aunt’s estate." },
                { id: 2, summary: "During her stay in London, the Gardiners propose a summer tour to the Lakes. This news is a source of great delight to Elizabeth, who longs for the 'rocks and mountains' to cure her of her disappointment with men. The party then sets off for Hunsford, with Elizabeth curious to see how Charlotte has arranged her life with the absurd Mr. Collins." }
            ],
            likes: 1900,
            bookmarks: 310
        },
        {
            id: 28,
            title: "The Parsonage at Hunsford",
            summary: "Elizabeth has arrived in Kent and found Charlotte's home to be a model of neatness and comfort. It seems that by encouraging Mr. Collins to spend his time in the garden, Charlotte has managed to secure a very tolerable existence for herself.",
            pages: [
                { id: 1, summary: "Mr. Collins receives Elizabeth with 'ostentatious formality,' leading her through every room of his house to ensure she sees what she declined. Elizabeth observes with amusement that Charlotte seems to have a talent for managing her husband, keeping him occupied elsewhere so she may enjoy her own sitting-room in peace. The house is small but well-arranged." },
                { id: 2, summary: "A carriage stops at the gate, and Elizabeth sees Miss de Bourgh for the first time. She finds the young lady to be 'sickly and cross,' a description that gives Elizabeth a most mischievous pleasure. She thinks to herself that such a woman will make a very proper wife for Mr. Darcy. The chapter ends with a formal invitation to dine at Rosings Park." }
            ],
            likes: 2700,
            bookmarks: 540
        },
        {
            id: 29,
            title: "The Dictatress of Rosings",
            summary: "The visit to Lady Catherine de Bourgh was every bit as formidable as I intended. She is a woman who considers it her duty to manage the affairs of everyone in her parish, and she found in Elizabeth a subject who was not so easily intimidated by her rank.",
            pages: [
                { id: 1, summary: "The party arrives at Rosings, where Sir William is quite overcome by the grandeur. Lady Catherine is a tall, large woman who speaks in a most authoritative tone. She immediately begins to question Elizabeth about her family, her sisters, and her education, expressing great shock that the Bennet girls were raised without a governess." },
                { id: 2, summary: "The dinner is an exercise in Lady Catherine's self-importance. She gives advice on every topic, from the care of poultry to the mending of clothes. Elizabeth answers her questions with a composed 'archness' that Lady Catherine is quite unaccustomed to. It is clear that Mr. Collins's worship of her is the only thing that keeps her in a state of 'affability.'" }
            ],
            likes: 4200,
            bookmarks: 1100
        },
        {
            id: 30,
            title: "The Arrival of the Nephews",
            summary: "Life at the Parsonage has settled into a quiet routine, punctuated only by the occasional visit from Rosings. But the atmosphere has suddenly changed, for Mr. Darcy and his cousin, Colonel Fitzwilliam, have arrived for their Easter visit.",
            pages: [
                { id: 1, summary: "Sir William returns home, leaving Elizabeth to spend her days in long walks and conversation with Charlotte. Elizabeth finds her favorite walk in a sheltered path along the park, where she is unlikely to be disturbed by Lady Catherine. She observes that while Mr. Collins is often at Rosings, Charlotte is quite happy to remain at home." },
                { id: 2, summary: "News reaches the parsonage that Mr. Darcy has arrived at Rosings with Colonel Fitzwilliam. Elizabeth looks forward to the addition to their social circle, primarily because she wishes to see how Darcy behaves in the presence of his intended bride, Miss de Bourgh. The gentlemen call at the parsonage the next morning, and the scene is set for a new series of encounters." }
            ],
            likes: 1800,
            bookmarks: 400
        },
        {
            id: 31,
            title: "The Musical Sparring",
            summary: "An evening at Rosings Park allows Elizabeth and Colonel Fitzwilliam to find much pleasure in one another’s conversation. Mr. Darcy, however, remains a silent observer, caught between his habitual reserve and a fascination he is increasingly unable to conceal.",
            pages: [
                { id: 1, summary: "While Elizabeth sits at the instrument, she and Colonel Fitzwilliam engage in a spirited discussion regarding Mr. Darcy’s social character. She playfully accuses him of a lack of propriety at the Meryton ball, while Darcy defends himself by confessing he lacks the talent of conversing easily with strangers. Elizabeth maintains that it is merely a lack of effort on his part, comparing it to her own lack of practice at the piano." },
                { id: 2, summary: "The scene is frequently interrupted by the intrusive advice of Lady Catherine, who dictates how Elizabeth should play and even offers her a place to practice—provided it is in a room where she will not be heard. Darcy’s visible embarrassment at his aunt’s behavior does not go unnoticed by Elizabeth, though she remains convinced that he is primarily concerned with his own dignity rather than any regard for her." }
            ],
            likes: 3100,
            bookmarks: 420
        },
        {
            id: 32,
            title: "The Unexpected Visitor",
            summary: "I must recount a most singular event: Mr. Darcy’s unexpected visit to the Parsonage while Elizabeth was quite alone. The meeting was marked by a silence that spoke of a deep, though unacknowledged, internal struggle.",
            pages: [
                { id: 1, summary: "While Charlotte and Maria are in the village, Mr. Darcy arrives at the house, appearing quite surprised to find Elizabeth alone. The conversation that follows is stiff and fragmented, touching upon the likelihood of Mr. Bingley ever returning to Netherfield. Darcy's manner is peculiar; he seems to be testing Elizabeth’s feelings toward her home and her willingness to be settled far from her family." },
                { id: 2, summary: "When Charlotte returns, she is convinced that Darcy’s visit is a sign of love. Elizabeth, however, finds the notion too absurd to consider, attributing his frequent appearances at the Parsonage to the general dullness of Rosings. We see the beginning of a pattern where Darcy and the Colonel become regular visitors, each drawn to Elizabeth’s company for reasons she is not yet prepared to understand." }
            ],
            likes: 2400,
            bookmarks: 310
        },
        {
            id: 33,
            title: "A Devastating Disclosure",
            summary: "During a solitary walk, Elizabeth encounters Colonel Fitzwilliam and learns the true cause of Jane’s heartbreak. It is a discovery that transforms her general dislike of Mr. Darcy into a focused and bitter resentment.",
            pages: [
                { id: 1, summary: "Elizabeth meets the Colonel in the park, and their conversation turns toward Mr. Darcy’s influence over his friends. With a most unfortunate openness, the Colonel reveals that Darcy recently congratulated himself on saving a close friend from a 'most imprudent marriage.' Elizabeth immediately understands this friend to be Bingley and the lady to be her own sister, Jane." },
                { id: 2, summary: "The weight of this information brings on a violent headache, and Elizabeth is forced to remain at home while the others dine at Rosings. She spends the evening in a state of wretched reflection, viewing Darcy as the person who has willfully destroyed Jane's happiness. Her prejudice is now fueled by a sense of familial injury, making his very name a burden to her thoughts." }
            ],
            likes: 3500,
            bookmarks: 620
        },
        {
            id: 34,
            title: "The Proposal at Hunsford",
            summary: "We have reached the moment of greatest agitation. Mr. Darcy has made his declaration, yet he did so with a lack of humility that ensured its failure. It was a scene of mutual pain, where the pride of one met the prejudice of the other.",
            pages: [
                { id: 1, summary: "Darcy enters the Parsonage and, in a state of visible emotion, confesses his love for Elizabeth. However, he unwisely chooses to dwell upon the obstacles his affection has overcome—specifically her family's social inferiority and his own sense of degradation. He speaks as if his proposal is an honor she could not possibly decline, quite unaware of the offense he is causing." },
                { id: 2, summary: "Elizabeth rejects him with a spirit that leaves him stunned. She accuses him of being the agent of Jane’s misery and of behaving with unpardonable cruelty toward Mr. Wickham. She informs him that even if she had felt an affection for him, his insulting manner of proposing would have extinguished it. Darcy leaves in a state of high indignation, and Elizabeth is left to weep over the tumult of the encounter." }
            ],
            likes: 6800,
            bookmarks: 1800
        },
        {
            id: 35,
            title: "The Letter of Explanation",
            summary: "The morning following the proposal brought a final encounter in the park. Mr. Darcy, with a composure that was as cold as it was resolute, delivered a letter to Elizabeth. It was a document intended not to plea for her heart, but to defend his character against her accusations.",
            pages: [
                { id: 1, summary: "Elizabeth is walking in her usual path when Darcy approaches. He speaks no words of affection, but merely hands her a letter and departs. The letter addresses her two primary charges: his interference with Bingley and his history with Wickham. He asks her to read it with the justice he believes he deserves, appealing to her sense of reason over her emotions." },
                { id: 2, summary: "Regarding Jane, Darcy admits he believed her indifferent and was repulsed by the behavior of the Bennet family (excepting Elizabeth and Jane). Regarding Wickham, he reveals a history of gambling, profligacy, and a most villainous attempt to elope with Darcy’s young sister, Georgiana, for her fortune. Elizabeth finds herself at the beginning of a most painful reappraisal of everything she thought she knew." }
            ],
            likes: 4200,
            bookmarks: 950
        },
        {
            id: 36,
            title: "The End of Prepossession",
            summary: "The reading of the letter was a trial of the mind that lasted many hours. Elizabeth was forced to witness the crumbling of her own certainties, as she realized that she had been as blind as those she so frequently mocked.",
            pages: [
                { id: 1, summary: "Elizabeth’s first reaction to Darcy's letter is one of total rejection, but as she examines each point, she finds that Wickham’s behavior has always lacked proof, while Darcy’s account aligns with the observations she has made but ignored. She recalls Wickham’s mercenary pursuit of Miss King and his inappropriate openness with her upon their first meeting." },
                { id: 2, summary: "The moment of self-realization is profound. She exclaims, 'I have courted prepossession and ignorance... Till this moment I never knew myself.' She acknowledges the justice of Darcy's critique of her family and realizes that her hatred for him was rooted in a wounded vanity. By the time she returns to the Parsonage, her prejudice has been utterly dismantled, replaced by a humiliating sense of her own error." }
            ],
            likes: 4900,
            bookmarks: 1200
        },
        {
            id: 37,
            title: "A Season of Reflection",
            summary: "The gentlemen have departed from Rosings, leaving the neighborhood in its usual state of quietude. Elizabeth is left with a heart full of secrets and a mind that can think of nothing but the man she so recently rejected.",
            pages: [
                { id: 1, summary: "Mr. Darcy and the Colonel leave Kent. Elizabeth is relieved that she will not have to see them again while she is in this state of mental confusion. Lady Catherine is in a state of ill-humor over the loss of her nephews, and Mr. Collins continues his usual rounds of sycophancy, quite unaware of the drama that has unfolded in his own house." },
                { id: 2, summary: "Elizabeth spends her remaining time in Kent studying Darcy’s letter until she knows every sentence by heart. She feels a new compassion for his disappointment and a deep regret for her own incivility. She looks forward to her return to Longbourn, though she dreads the news she must eventually share with Jane regarding the Bingleys." }
            ],
            likes: 1900,
            bookmarks: 380
        },
        {
            id: 38,
            title: "Departure from Hunsford",
            summary: "Elizabeth’s visit to Kent has come to its conclusion. She parts from Charlotte with a mixture of affection and pity, and sets off for London to collect Jane. The journey is one of reflection on the strange turns her life has taken in a few short weeks.",
            pages: [
                { id: 1, summary: "Mr. Collins offers a long and tedious farewell, dwelling upon the 'extraordinary advantage' of his connection to Rosings. Elizabeth observes Charlotte’s management of her husband with a new understanding, realizing that her friend has indeed found a level of contentment that Elizabeth could never share. The carriage at last carries her away from the pomposity of Hunsford." },
                { id: 2, summary: "Elizabeth arrives at the Gardiners’ house in London and is reunited with Jane. She finds her sister looking well but still carrying the quiet burden of her disappointment. Elizabeth decides to wait until they are in the privacy of Longbourn before revealing the truth of Darcy’s proposal and the contents of his letter." }
            ],
            likes: 1600,
            bookmarks: 410
        },
        {
            id: 39,
            title: "The Meeting at the Inn",
            summary: "The sisters are met on their journey home by Kitty and Lydia. The younger girls are in a state of frivolous excitement that provides a sharp and painful contrast to the gravity of Elizabeth’s recent experiences.",
            pages: [
                { id: 1, summary: "The party meets at an inn for a meal. Lydia and Kitty are full of news concerning the militia and their impending move to Brighton. Lydia’s talk is entirely of officers and silly pranks, and she reveals with great glee that Wickham is no longer engaged to Miss King. Elizabeth is struck by the emptiness of her sister’s mind and the danger of her unchecked behavior." },
                { id: 2, summary: "The drive back to Longbourn is filled with Lydia’s loud laughter and constant gossip. Elizabeth watches the effect of this on the people they pass and feels a deep sense of shame for her family’s public lack of decorum. They arrive home to a mother who is only interested in news of the latest fashions and the health of the Collinses." }
            ],
            likes: 2100,
            bookmarks: 540
        },
        {
            id: 40,
            title: "The Confidence of Sisters",
            summary: "At last, Elizabeth has shared the secret of Mr. Darcy’s proposal and the truth of Mr. Wickham’s character with Jane. The disclosure has left Jane in a state of shock, as the two sisters attempt to navigate a path between truth and social safety.",
            pages: [
                { id: 1, summary: "Elizabeth recounts the scene at Hunsford and the contents of the letter. Jane is astonished that Darcy could be so in love with Elizabeth and equally distressed by the proof of Wickham’s villainy. Her sweet nature leads her to hope there might still be some mistake, but the evidence Darcy provided is too systematic to be ignored." },
                { id: 2, summary: "The sisters discuss whether it is their duty to expose Wickham. Elizabeth argues against it, as it would require making Darcy’s private affairs public. They decide to remain silent, believing that Wickham will soon leave the neighborhood with the regiment. It is a decision made with the best intentions, yet I fear it is one they may soon regret." }
            ],
            likes: 3800,
            bookmarks: 890
        },
        {
            id: 41,
            title: "The Brighton Invitation",
            summary: "The regiment is to leave Meryton, much to the distress of the younger girls. Lydia, however, has received an invitation to Brighton from Mrs. Forster. Elizabeth, sensing the danger of such an excursion, attempts to warn her father, but her advice is met with a most unfortunate dismissal.",
            pages: [
                { id: 1, summary: "Lydia is in a state of high rapture over the invitation to accompany Mrs. Forster to Brighton. Elizabeth, privately concerned for her sister's character and the family's reputation, entreats Mr. Bennet to forbid the journey. She argues that Lydia’s unchecked flirtation will eventually lead to lasting disgrace. Mr. Bennet, however, chooses his own ease over his parental duty, believing Lydia is too insignificant to cause a real scandal and that the officers will find her as tiresome as he does." },
                { id: 2, summary: "Before the regiment departs, Elizabeth sees Mr. Wickham for the last time. She subtly lets him know that she has been in Kent and is better acquainted with his history than he might wish. Wickham’s attempts at his usual charm are now met with a cool, guarded politeness. Elizabeth is relieved to see him go, hoping that with the removal of the militia, her family might finally find some degree of quietude and propriety." }
            ],
            likes: 2100,
            bookmarks: 350
        },
        {
            id: 42,
            title: "The Journey to Derbyshire",
            summary: "Elizabeth reflects upon the unfortunate marriage of her parents, a union where respect was very early lost. However, the summer brings a change of scene as she set off for Derbyshire with the Gardiners. It is a journey that leads her, quite against her initial inclination, to the very gates of Pemberley.",
            pages: [
                { id: 1, summary: "Elizabeth observes the impropriety of her father's behavior as a husband, noting that he has long sought comfort in his books and the country to escape the folly of his wife. She feels the disadvantages her sisters face in such a household. The planned tour to the Lakes is shortened by Mr. Gardiner’s business, and the party instead decides to travel to Derbyshire, the home of Mr. Darcy’s ancestors." },
                { id: 2, summary: "While staying at Lambton, Mrs. Gardiner suggests a visit to Pemberley. Elizabeth is filled with a secret dread of meeting the owner, but she is reassured by the chambermaid that the family is away. Her curiosity to see the house, which she had so narrowly missed being the mistress of, finally outweighs her reluctance. She agrees to go, little suspecting the transformation she is about to witness." }
            ],
            likes: 2400,
            bookmarks: 410
        },
        {
            id: 43,
            title: "The Face of Pemberley",
            summary: "My dear, the beauty of Pemberley is matched only by the surprising reports of its master. From the housekeeper's warm praises to an unexpected encounter on the lawn, Elizabeth’s understanding of Mr. Darcy is challenged in a manner that leaves her quite speechless.",
            pages: [
                { id: 1, summary: "Elizabeth finds Pemberley to be a place of 'real elegance,' where the natural beauty of the woods is not marred by an awkward taste. She meets the housekeeper, Mrs. Reynolds, who speaks of Mr. Darcy with an affection and respect that Elizabeth finds nearly incredible. Mrs. Reynolds describes him as the most generous-hearted boy and the kindest master, specifically noting his devotion to his young sister." },
                { id: 2, summary: "While walking through the grounds, Elizabeth is suddenly confronted by Mr. Darcy himself. The encounter is marked by a deep embarrassment on both sides, yet Darcy’s behavior is strikingly altered. He is not only civil but attentive, inquiring after her family and speaking with a softness in his voice that Elizabeth had never before heard. He requests to be introduced to the Gardiners, treating them with a respect he had previously denied them." },
                { id: 3, summary: "Elizabeth is stunned by the change. Darcy’s civility toward her aunt and uncle, whom he previously looked upon with disdain, is a powerful proof of his self-conquest. He even invites Mr. Gardiner to fish in his stream. Elizabeth is left to wonder at the cause of such an alteration, feeling a mixture of gratitude and confusion that she is unable to resolve." }
            ],
            likes: 5600,
            bookmarks: 1400
        },
        {
            id: 44,
            title: "Introduction to a Sister",
            summary: "Mr. Darcy’s attentions continue to be as pointed as they are civil. He brings his sister, Georgiana, to visit Elizabeth, and even Mr. Bingley makes his appearance. It is a time of quiet observation, where the past and the present meet in the drawing-rooms of Derbyshire.",
            pages: [
                { id: 1, summary: "The morning after their meeting, Darcy brings Miss Darcy to the inn to wait on Elizabeth. Elizabeth finds the young lady to be exceedingly shy and gentle, a far cry from the proud creature Wickham had described. Mr. Bingley soon joins them, and his delight at seeing Elizabeth—and his subtle mention of her sister Jane—suggests that his heart is not yet as indifferent as his sisters might wish." },
                { id: 2, summary: "The Gardiners are convinced that Darcy is in love with Elizabeth. Elizabeth herself is in a 'flutter of spirits,' struggling to reconcile her former prejudice with the man who now stands before her. Darcy invites the whole party to dinner at Pemberley, a mark of high distinction. Elizabeth begins to realize that her own feelings are no longer those of dislike, though she dares not call it love." }
            ],
            likes: 3100,
            bookmarks: 520
        },
        {
            id: 45,
            title: "A Failed Humiliation",
            summary: "A morning at Pemberley provided Miss Bingley with an opportunity to exercise her jealousy. She attempted to remind Mr. Darcy of the Bennets’ lower connections by mentioning the militia, but her cruelty only served to strengthen his defense of Elizabeth.",
            pages: [
                { id: 1, summary: "Elizabeth and Mrs. Gardiner pay their return visit to Pemberley. Miss Bingley and Mrs. Hurst are present and treat them with a coldness that borders on the uncivil. Seeking to wound Elizabeth, Miss Bingley mentions the departure of the militia from Meryton, pointedly alluding to Mr. Wickham in front of both Darcy and his sister. It is a moment of great indelicacy." },
                { id: 2, summary: "Miss Darcy is visibly distressed by the mention of a man she nearly eloped with, but Darcy remains composed. Once Elizabeth has left, Miss Bingley attempts to mock her appearance and her family, but Darcy silences her by declaring that he has long considered Elizabeth one of the handsomest women of his acquaintance. Elizabeth remains unaware of this defense, yet she feels the growing jealousy of the Bingley sisters." }
            ],
            likes: 2900,
            bookmarks: 480
        },
        {
            id: 46,
            title: "The News of Elopement",
            summary: "The arrival of two letters from Jane has brought a sudden and terrible end to the pleasure of Derbyshire. Lydia has run away with Wickham, and the family is faced with absolute ruin. In her distress, Elizabeth confides in Mr. Darcy, believing that this news must finalise their separation.",
            pages: [
                { id: 1, summary: "Jane’s letters reveal that Lydia has eloped with Wickham from Brighton. What was initially thought to be a journey to Scotland is now feared to be a hidden life in London, as Wickham has no intention of marrying a girl without a fortune. Elizabeth is overcome with grief and shame, realizing that her sister is lost and the family's reputation is forever tainted." },
                { id: 2, summary: "Mr. Darcy enters the room while Elizabeth is in the depths of her agitation. She shares the news with him, lamenting her own silence regarding Wickham’s character. Darcy listens with a gravity that Elizabeth interprets as the final death of his regard for her. When he leaves, she is certain that he will never wish to connect himself with a family involved in such an infamy." }
            ],
            likes: 4800,
            bookmarks: 1100
        },
        {
            id: 47,
            title: "The Return of the Mourners",
            summary: "The journey back to Longbourn is one of silent anguish. Elizabeth must face her mother’s hysterics and the realization that the neighborhood is already feasting upon their misfortune. Mr. Bennet has gone to London, but the hope of finding Lydia remains very small.",
            pages: [
                { id: 1, summary: "Elizabeth and the Gardiners return to find Mrs. Bennet in a state of 'poor nerves,' blaming everyone but herself for the disaster. She is particularly vocal against the Forsters for not guarding Lydia more carefully. Mr. Bennet is in London, attempting to trace the couple, but the family knows he is ill-suited for such a desperate and active search." },
                { id: 2, summary: "Elizabeth and Jane discuss the situation with a heavy heart. They learn from Colonel Forster that Wickham’s debts are even more significant than they feared, and that he had been planning his flight for some time. The sisters are forced to witness the total lack of propriety in their mother’s grief, which adds to their own sense of mortification." }
            ],
            likes: 1900,
            bookmarks: 320
        },
        {
            id: 48,
            title: "Mr. Collins’s Condolence",
            summary: "I must share with you a letter from Mr. Collins that illustrates the most uncharitable side of human nature. While the Gardiners assist in the search, our cousin offers a lesson in moral superiority that is as brutal as it is unsolicited.",
            pages: [
                { id: 1, summary: "Mr. Gardiner follows Mr. Bennet to London to help manage the search. In Meryton, Wickham is now universally condemned as a villain, though he was once the neighborhood's favorite. Elizabeth reflects on her own role in his success, wishing she had been more open about his true history with Mr. Darcy." },
                { id: 2, summary: "Mr. Collins sends a letter of 'condolence' to Mr. Bennet. He advises his cousin to cast off Lydia forever and suggests that her death would have been a blessing in comparison to such a disgrace. He also notes that the event will ruin the marriage prospects of all the remaining sisters. Elizabeth finds the letter to be a masterpiece of pompous cruelty." }
            ],
            likes: 2200,
            bookmarks: 450
        },
        {
            id: 49,
            title: "The Bribe of Marriage",
            summary: "A letter from Mr. Gardiner has brought news that Lydia and Wickham have been found. They are to be married, but it is clear to all that a massive financial arrangement has been made. Mr. Bennet is relieved of the immediate shame, yet he is burdened by a debt he knows he cannot repay.",
            pages: [
                { id: 1, summary: "Mr. Gardiner reports that Wickham has agreed to marry Lydia on the condition that her small inheritance is settled upon her and that he receives a hundred pounds a year. Mr. Bennet realizes that these terms are suspiciously low, suggesting that a large sum of money must have been paid to Wickham secretly to secure the marriage." },
                { id: 2, summary: "Mr. Bennet assumes that Mr. Gardiner has paid the bribe out of his own pocket to save the family. He is deeply humbled by his brother-in-law’s generosity and resolves to repay him as soon as he is able. Elizabeth is equally grateful, though she remains sickened by the thought that her sister is now permanently tied to a man of Wickham's character." }
            ],
            likes: 2700,
            bookmarks: 510
        },
        {
            id: 50,
            title: "A Mother’s Short Memory",
            summary: "As soon as the marriage is confirmed, Mrs. Bennet’s 'nerves' are entirely forgotten. She is now focused on wedding clothes and neighborly gossip, quite indifferent to the cost of such a salvation. Elizabeth, however, is left to reflect on her own heart and the man she has truly lost.",
            pages: [
                { id: 1, summary: "Mrs. Bennet returns to her place at the table with an exuberant joy that Elizabeth finds more embarrassing than her previous grief. She obsessively plans the wedding finery and which house the couple should take. Mr. Bennet is forced to forbid the Wickhams from ever entering Longbourn, a command that his wife is quite unable to understand." },
                { id: 2, summary: "Elizabeth undergoes a profound realization. She sees at last that Mr. Darcy was 'exactly the man who, in disposition and talents, would most suit her.' She understands that a union with him would have been the foundation of her greatest happiness. But now, as the sister-in-law of his enemy, she knows that he will never again seek her hand. She repents her past prejudice with a sincerity that comes, alas, too late." }
            ],
            likes: 3500,
            bookmarks: 820
        },
        {
            id: 51,
            title: "The Bride’s Return",
            summary: "Lydia and Mr. Wickham have arrived at Longbourn as a married couple. I must confess, their lack of shame was a trial to the whole family. However, a single, accidental word from Lydia has provided Elizabeth with a clue that points to a most unexpected presence at their wedding.",
            pages: [
                { id: 1, summary: "The Wickhams arrive with an 'easy assurance' that Elizabeth and Jane find quite repulsive. Lydia is entirely unchanged, boasting of her marriage and her new status, seemingly unaware of the ruin she nearly brought upon her sisters. She insists on taking her place at the head of the table, exulting in the precedence her marriage gives her over her elder sisters." },
                { id: 2, summary: "During a detailed account of the ceremony, Lydia lets slip that Mr. Darcy was present at the church. She quickly attempts to retract the statement, claiming she was sworn to secrecy. Elizabeth is struck with wonder; she cannot fathom why a man of Darcy’s character would attend the wedding of a man he so justly despises. She immediately writes to her aunt, Mrs. Gardiner, to request the truth." }
            ],
            likes: 3200,
            bookmarks: 410
        },
        {
            id: 52,
            title: "The Disinterested Benefactor",
            summary: "The reply from Mrs. Gardiner has arrived, and it has quite overwhelmed Elizabeth's heart. It was not her uncle who saved the family from disgrace, but Mr. Darcy. He acted with a secrecy and a generosity that speak of a most profound change in his character—and perhaps, a lingering affection.",
            pages: [
                { id: 1, summary: "Mrs. Gardiner’s letter details how Darcy sought out the couple in London, using his own funds and influence to bribe Wickham into the marriage. He paid Wickham's gambling debts, purchased his commission in the regulars, and provided a settlement for Lydia. He did this all while insisting that Mr. Gardiner take the credit, wishing to remain entirely unknown in the transaction." },
                { id: 2, summary: "Elizabeth is deeply moved by the knowledge that Darcy has done all this for a family that had treated him with such incivility. She realizes he has conquered his own pride to save her sister, and she feels a renewed sense of gratitude and regret. She begins to hope that his feelings for her are not entirely extinguished, though she fears the connection with Wickham may still prove an insurmountable barrier." }
            ],
            likes: 5800,
            bookmarks: 1600
        },
        {
            id: 53,
            title: "A Return to Netherfield",
            summary: "The neighborhood is once again in a state of expectation, for Mr. Bingley and Mr. Darcy have returned to Netherfield. Mrs. Bennet is in a fever of social planning, quite unaware that the man she treats with such rudeness is the very one who preserved her family's name.",
            pages: [
                { id: 1, summary: "Mr. Bingley and Mr. Darcy call at Longbourn. Mrs. Bennet is fawningly attentive to Bingley while maintaining a pointed and embarrassing coldness toward Darcy. Elizabeth is in a state of great agitation, unable to speak to Darcy privately and pained by her mother’s behavior. Darcy remains silent and grave, which leads Elizabeth to fear that his interest in her has finally waned." },
                { id: 2, summary: "The visit is an awkward affair for all but Mrs. Bennet and Mr. Bingley. Elizabeth watches the two of them and sees that Bingley’s admiration for Jane is as evident as ever. When the gentlemen depart, Jane maintains her usual composure, but Elizabeth is left to brood over Darcy’s silence, wondering if she has lost the opportunity to truly know him." }
            ],
            likes: 2400,
            bookmarks: 390
        },
        {
            id: 54,
            title: "A Trial of Silence",
            summary: "A grand dinner at Longbourn provides another opportunity for observation. While Mr. Bingley is clearly moving toward a declaration, Mr. Darcy remains at a distance from Elizabeth. It is a night of social duty that leaves Elizabeth with more questions than answers regarding his heart.",
            pages: [
                { id: 1, summary: "The Netherfield party dines at Longbourn. Elizabeth is forced to sit far from Darcy and finds no chance for the conversation she so deeply desires. She observes him from across the table, noting his serious demeanor. Mrs. Bennet continues to ignore Darcy while exalting in Bingley’s presence, creating a scene of the most uncomfortable irony for Elizabeth." },
                { id: 2, summary: "After dinner, Elizabeth hopes for a moment of private conversation during tea, but the arrangements of the room prevent it. She is vexed by the 'nothingness' of the evening and Darcy’s apparent indifference. However, she finds some solace in witnessing Jane’s quiet happiness, as it becomes increasingly certain that Bingley will soon make his offer." }
            ],
            likes: 2100,
            bookmarks: 320
        },
        {
            id: 55,
            title: "The Happy Event",
            summary: "The moment Jane has waited for has arrived! Mr. Bingley visited Longbourn alone and, within the hour, secured Jane’s consent. It is a triumph of genuine affection over social maneuvering, and the household is filled with a rare and sincere joy.",
            pages: [
                { id: 1, summary: "Bingley returns to Longbourn without his friend. Mrs. Bennet, with a transparency that is as humorous as it is embarrassing, clears the room to leave the couple alone. Bingley finally proposes, and Jane accepts with all the sweetness of her nature. They are perfectly suited, and even Mr. Bennet expresses his sincere approval of the match." },
                { id: 2, summary: "Jane reveals to Elizabeth that Bingley was kept from her by the influence of others, but that he never truly lost his love. Elizabeth is delighted for her sister, yet she cannot help but feel her own solitude more keenly. She wonders if Darcy gave Bingley his 'permission' to return, and what that might imply for her own future." }
            ],
            likes: 4200,
            bookmarks: 980
        },
        {
            id: 56,
            title: "The Interruption of Rank",
            summary: "A carriage of the most formidable sort has arrived! Lady Catherine de Bourgh has descended upon Longbourn to confront Elizabeth regarding the rumors of her engagement to Mr. Darcy. It was a battle between the arrogance of rank and the dignity of a sensible mind.",
            pages: [
                { id: 1, summary: "Lady Catherine demands a private audience with Elizabeth in the shrubbery. She is abusive and haughty, stating that a match between Elizabeth and her nephew would be a 'pollution' of Pemberley. She insists that Darcy is engaged to her own daughter, Miss de Bourgh, and demands a promise that Elizabeth will never accept a proposal from him." },
                { id: 2, summary: "Elizabeth stands her ground with a composure that leaves Lady Catherine incensed. She refuses to make any such promise, asserting her right to seek her own happiness without regard to Lady Catherine's whims. Elizabeth points out that if Darcy were truly engaged elsewhere, he would not be making offers to her. Lady Catherine departs in a rage, calling Elizabeth a 'selfish girl.'" }
            ],
            likes: 7200,
            bookmarks: 2100
        },
        {
            id: 57,
            title: "An Ironical Congratulation",
            summary: "A letter from Mr. Collins has provided Mr. Bennet with a great deal of amusement. He laughs at the rumor of Elizabeth’s engagement to Mr. Darcy, quite unaware that his daughter’s heart is now entirely devoted to the man he believes she still hates.",
            pages: [
                { id: 1, summary: "Mr. Bennet calls Elizabeth into his library to share a letter from Collins, which warns against the 'disgraceful' match with Darcy. Mr. Bennet finds the idea of Darcy being in love with Elizabeth to be the height of absurdity, noting that Darcy never looks at a woman but to see a blemish. Elizabeth is forced to join in his laughter, though it is a most painful exercise." },
                { id: 2, summary: "The irony of the situation is not lost on Elizabeth. She realizes how effectively she has hidden her change of heart from her family. She feels a deep sense of isolation, fearing that if even her father finds the match impossible, there may truly be no hope for a future with Mr. Darcy. She waits in a state of anxious uncertainty." }
            ],
            likes: 2800,
            bookmarks: 450
        },
        {
            id: 58,
            title: "The Final Declaration",
            summary: "The moment of truth has finally arrived. During a walk to Oakham Mount, Elizabeth finds the courage to thank Mr. Darcy for his kindness to Lydia. This opening allows Darcy to speak from his heart, leading to a second proposal that was as humble as the first was proud.",
            pages: [
                { id: 1, summary: "Elizabeth and Darcy find themselves walking alone. She expresses her gratitude for his role in Lydia’s marriage, telling him that her family would never have been saved without him. Darcy replies that he did it only for her. He then confesses that his feelings and wishes are unchanged, but that one word from her will silence him on the subject forever." },
                { id: 2, summary: "Elizabeth, with a heart now full of 'affection and gratitude,' lets him know that her sentiments have undergone a total change. The joy this brings to Darcy is visible in his every feature. They spend the rest of the walk in a state of perfect understanding, discussing how they have both been humbled and improved by their acquaintance with each other." }
            ],
            likes: 9500,
            bookmarks: 4800
        },
        {
            id: 59,
            title: "Disbelief and Delirium",
            summary: "The engagement must now be revealed to the family. While Jane is the first to share in the joy, the parents’ reactions provide a study in character. From Mr. Bennet’s skepticism to Mrs. Bennet’s financial ecstasy, the household is in a state of total surprise.",
            pages: [
                { id: 1, summary: "Jane is at first incredulous, believing Elizabeth must be joking. Once convinced, her joy for her sister is as sincere as her own. Elizabeth then faces her father, who is genuinely concerned that she is marrying a man she dislikes for the sake of his fortune. Elizabeth is forced to reveal Darcy’s role in saving Lydia, which finally secures her father’s respect and consent." },
                { id: 2, summary: "Mrs. Bennet's reaction is the most remarkable of all. Upon hearing the news, she is momentarily silenced. When she recovers, she descends into a state of delirium, obsessed with the 'ten thousand a year,' the jewels, and the carriages. Her previous hatred for Darcy is instantly forgotten, replaced by a greed that Elizabeth finds quite as embarrassing as her former resentment." }
            ],
            likes: 3100,
            bookmarks: 640
        },
        {
            id: 60,
            title: "Retrospective Feelings",
            summary: "Elizabeth and Darcy reflect upon the beginning of their attachment. They consider the influence of Lady Catherine's interference and the role of the Gardiners in bringing them together. Elizabeth writes to her aunt to share the news that her favorite niece is to be the mistress of Pemberley.",
            pages: [
                { id: 1, summary: "Darcy admits that he cannot fix on the exact hour he began to love her, but that he was 'in the middle before he knew that he had begun.' They realize that Lady Catherine’s attempt to separate them actually gave Darcy the hope he needed to visit Longbourn again. It is a conversation of much tenderness and mutual respect." },
                { id: 2, summary: "Elizabeth writes a joyous letter to Mrs. Gardiner, acknowledging that Pemberley is the best reward for her northern tour. She invites the Gardiners to the estate for Christmas, giving credit where it is truly due. The chapter emphasizes the growth of both characters and the dismantling of the pride and prejudice that once divided them." }
            ],
            likes: 2900,
            bookmarks: 520
        },
        {
            id: 61,
            title: "Domestic Felicity",
            summary: "We conclude with a final look at the lives of our characters. While Jane and Elizabeth find the truest form of happiness in their marriages, the rest of the family continues in their established patterns. It is a resolution that brings a sense of peace and propriety to our history.",
            pages: [
                { id: 1, summary: "Mr. Bennet misses Elizabeth's company and becomes a frequent visitor at Pemberley. Jane and Bingley eventually purchase an estate nearby to be close to the Darcys. Kitty improves significantly under the guidance of her elder sisters, while Mary remains at home, finding her own quiet contentment away from the shadow of her sisters' beauty. Lydia and Wickham remain as they were—extravagant, unsettled, and always in need of financial assistance." },
                { id: 2, summary: "Elizabeth and Georgiana become the most affectionate of sisters, and even Lady Catherine is eventually reconciled to the match. The Gardiners remain the most honored of relations, for they were the primary instruments in uniting two hearts that were once so far apart. The story ends with the conviction that the truest happiness is found in a union of sense, respect, and deep affection." }
            ],
            likes: 5600,
            bookmarks: 2400
        }
    ]
}

];