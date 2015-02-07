/*global describe, it, before, after, beforeEach, afterEach */
/*jshint unused:false */
(function (window) {

    "use strict";

    require("js-ext/lib/object.js");
    require("window-ext");
    require("../vdom.js")(window);
    // require('../partials/extend-element.js')(window);
    // require('../partials/extend-document.js')(window);

    var chai = require('chai'),
        expect = chai.expect,
        should = chai.should(),
        NS = require('../partials/vdom-ns.js')(window),
        nodeids = NS.nodeids,
        TRANSFORM = 'transform',
        VENDOR_CSS = require('polyfill/extra/vendorCSS.js')(window),
        generateVendorCSSProp = VENDOR_CSS.generator,
        VENDOR_CSS_PROPERTIES = VENDOR_CSS.cssProps,
        VENDOR_TRANSFORM_PROPERTY = generateVendorCSSProp(TRANSFORM),
        VENDOR_TRANSITION_PROPERTY = require('polyfill/extra/transition.js')(window),
        async = require('utils/lib/timers.js').async,
        SUPPORT_INLINE_PSEUDO_STYLES = window.document._supportInlinePseudoStyles,
        node, nodeSub1, nodeSub2, nodeSub3, nodeSub3Sub, nodeSub3SubText, container, containerSub1, containerSub2, containerSub3, cssnode;

    chai.use(require('chai-as-promised'));

    describe('Methods', function () {
        this.timeout(30000);

        // bodyNode looks like this:
        /*
        <div id="ITSA" class="red blue" style="position: absolute; z-index: -1; left: 10px; top: 30px; height: 75px; width: 150px;">
            <div id="sub1" class="green yellow"></div>
            <div id="sub2" class="green yellow"></div>
            <div id="sub3">
                <div id="sub3sub" class="green yellow"></div>
                extra text
            </div>
        </div>
        */

        // Code to execute before every test.
        beforeEach(function() {
            node = window.document.createElement('div');
            node.id = 'ITSA';
            node.className = 'red blue';
            node.setAttribute('style', 'position: absolute; z-index: -1; left: 10px; top: 30px; height: 75px; width: 150px;');
                nodeSub1 = window.document.createElement('div');
                nodeSub1.id = 'sub1';
                nodeSub1.className = 'green yellow';
                node.appendChild(nodeSub1);

                nodeSub2 = window.document.createElement('div');
                nodeSub2.className = 'green yellow';
                nodeSub2.id = 'sub2';
                node.appendChild(nodeSub2);

                nodeSub3 = window.document.createElement('div');
                nodeSub3.id = 'sub3';
                node.appendChild(nodeSub3);

                    nodeSub3Sub = window.document.createElement('div');
                    nodeSub3Sub.className = 'green yellow';
                    nodeSub3Sub.id = 'sub3sub';
                    nodeSub3.appendChild(nodeSub3Sub);

                    nodeSub3SubText = window.document.createTextNode('extra text');
                    nodeSub3.appendChild(nodeSub3SubText);

            window.document.body.appendChild(node);
        });

        // Code to execute after every test.
        afterEach(function() {
            window.document.body.removeChild(node);
        });

        it('next with container', function () {
            var inspectedNode = '<ul style="opacity: 0;">';
                inspectedNode += '<li id="li-1"></li>';
                inspectedNode += '<li id="li-2"></li>';
                inspectedNode += '<li id="li-3"></li>';
                inspectedNode += '<li id="li-4"></li>';
                inspectedNode += '<li id="li-5">';
                    inspectedNode += '<ul>';
                        inspectedNode += '<li id="li-6"></li>';
                        inspectedNode += '<li id="li-7"></li>';
                        inspectedNode += '<li id="li-8">';
                           inspectedNode += '<ul>';
                                inspectedNode += '<li id="li-9"></li>';
                                inspectedNode += '<li id="li-10"></li>';
                           inspectedNode += '</ul>';
                        inspectedNode += '</li>';
                        inspectedNode += '<li id="li-11"></li>';
                        inspectedNode += '<li id="li-12"></li>';
                    inspectedNode += '</ul>';
                inspectedNode += '</li>';
                inspectedNode += '<li id="li-13"></li>';
                inspectedNode += '<li id="li-14">';
                    inspectedNode += '<ul>';
                        inspectedNode += '<li id="li-15"></li>';
                        inspectedNode += '<li id="li-16"></li>';
                    inspectedNode += '</ul>';
                inspectedNode += '</li>';
                inspectedNode += '<li id="li-17"></li>';
            inspectedNode += '</ul>';

            var insertednode = window.document.body.append(inspectedNode);
            var liNode = window.document.getElement('#li-3');

            for (var nr=4; nr<=17; nr++) {
                liNode = liNode.next('li', insertednode);
                expect(liNode.getId()).to.be.equal('li-'+nr);
            }

            insertednode.remove();
        });

        it('previous with container', function () {
            var inspectedNode = '<ul style="opacity: 0;">';
                inspectedNode += '<li id="li-a1"></li>';
                inspectedNode += '<li id="li-a2"></li>';
                inspectedNode += '<li id="li-a3"></li>';
                inspectedNode += '<li id="li-a4"></li>';
                inspectedNode += '<li id="li-a5">';
                    inspectedNode += '<ul>';
                        inspectedNode += '<li id="li-a6"></li>';
                        inspectedNode += '<li id="li-a7"></li>';
                        inspectedNode += '<li id="li-a8">';
                           inspectedNode += '<ul>';
                                inspectedNode += '<li id="li-a9"></li>';
                                inspectedNode += '<li id="li-a10"></li>';
                           inspectedNode += '</ul>';
                        inspectedNode += '</li>';
                        inspectedNode += '<li id="li-a11"></li>';
                        inspectedNode += '<li id="li-a12"></li>';
                    inspectedNode += '</ul>';
                inspectedNode += '</li>';
                inspectedNode += '<li id="li-a13"></li>';
                inspectedNode += '<li id="li-a14">';
                    inspectedNode += '<ul>';
                        inspectedNode += '<li id="li-a15"></li>';
                        inspectedNode += '<li id="li-a16"></li>';
                    inspectedNode += '</ul>';
                inspectedNode += '</li>';
                inspectedNode += '<li id="li-a17"></li>';
                inspectedNode += '<li id="li-a18"></li>';
                inspectedNode += '<li id="li-a19"></li>';
                inspectedNode += '<li id="li-a20"></li>';
                inspectedNode += '<li id="li-a21"></li>';
            inspectedNode += '</ul>';

            var insertednode = window.document.body.append(inspectedNode);
            var liNode = window.document.getElement('#li-a19');

            for (var nr=18; nr>0; nr--) {
                liNode = liNode.previous('li', insertednode);
                expect(liNode.getId()).to.be.equal('li-a'+nr);
            }

            insertednode.remove();
        });
    });


}(global.window || require('node-win')));